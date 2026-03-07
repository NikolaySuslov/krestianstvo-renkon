// reflector.js
// Krestianstvo - Renkon | SDK 4

import { ProgramState } from 'renkon-core';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';

let lastTime = 0;

global.requestAnimationFrame = (callback) => {
  const currentTime = Number(process.hrtime.bigint() / 1000000n);
  const delay = Math.max(0, 16 - (currentTime - lastTime));
  
  return setTimeout(() => {
    lastTime = currentTime + delay;
    callback(lastTime);
  }, delay);
};

const app = express();
app.use(express.static('public'));
const server = http.createServer(app);

const wss = new WebSocketServer({ server });

const clients = new Map();
const selos = new Map();
const pendingJoiners = new Map();

// Create a selo with its own Renkon program
function createSelo(seloId) {
    console.log(`Creating selo: ${seloId}`);
    
    const reflector = {
        clients: clients,
        selos: selos,
        seloId: seloId,
        // Message queue for this selo (fed by WebSocket handlers)
        messageQueue: [],
        messageResolvers: [],
        pendingJoiners
    };

    // Selo-specific reactive program
    function seloProgram() {
        const app = Renkon.app;
        
        // 1. Authoritative Clock (20Hz)
        const pulse = Events.timer(50);
        const vTime = Events.collect(0, pulse, (t) => t + 50);

        // 2. Network messages as async generator stream
        const networkMessagesGen = (async function* () {
            while (true) {
                // Wait for next message from the queue
                const message = await new Promise((resolve) => {
                    if (app.messageQueue.length > 0) {
                        resolve(app.messageQueue.shift());
                    } else {
                        app.messageResolvers.push(resolve);
                    }
                });
                
                console.log(`[Selo ${app.seloId}] 📩 Generator yielding:`, message.type);
                yield message;
            }
        })();
        
        const networkMessagesRaw = Events.next(networkMessagesGen);
        
        // Extract value from generator result
        const networkMessages = Behaviors.collect(
            null,
            networkMessagesRaw,
            (_, result) => {
                if (result && !result.done && result.value) {
                    console.log(`[Selo ${app.seloId}] 📬 Extracted:`, result.value.type);
                    return result.value;
                }
                return null;
            }
        );

        // 3. IMMEDIATE ECHO - Stamp and broadcast incoming messages immediately
        const immediateEcho = Behaviors.collect(
            null,
            networkMessages,
            (_, ev) => {
                // Echo client_msg with server timestamp
                if (ev && ev.type === 'client_msg') {
                    // snapshot_response is point-to-point (leader→server→joiner only).
                    // Do not broadcast it to all peers and do not journal it.
                    if (ev.data?.type === 'snapshot_response') {
                        return null;
                    }

                    console.log(`[Selo ${app.seloId}] Processing client_msg from ${ev.from}`);
                    
                    const stampedMessage = {
                        ...ev.data,
                        serverTime: vTime,
                        from: ev.from,
                        timestamp: ev.timestamp
                    };
                    
                    const selo = app.selos.get(app.seloId);
                    if (selo) {
                        let sent = 0;
                        selo.clients.forEach((clientId) => {
                            if (app.pendingJoiners.has(clientId)) { app.pendingJoiners.get(clientId).buffer.push({ type: 'client_msg', data: stampedMessage, from: ev.from }); return; }
                            const client = app.clients.get(clientId);
                            if (client && client.ws.readyState === 1) {
                                client.ws.send(JSON.stringify({
                                    type: 'client_msg',
                                    data: stampedMessage,
                                    from: ev.from
                                }));
                                sent++;
                            }
                        });
                        console.log(`[Selo ${app.seloId}] ✅ Echoed to ${sent} clients at t=${vTime}`);
                    }
                    
                    return stampedMessage;
                }

                // Broadcast a stamped {0,0} move for the new client so all existing
                // peers see the avatar appear immediately without waiting for a click.
                if (ev && ev.type === 'connect') {
                    // Broadcast connect to all existing (non-pending) peers so they
                    // re-send their own _join. The new joiner is in pendingJoiners,
                    // so those _join re-announcements will be buffered for them and
                    // flushed after snapshot — guaranteeing all avatars are visible.
                    const selo = app.selos.get(app.seloId);
                    if (selo) {
                        const msg = JSON.stringify({ type: 'connect', from: ev.from });
                        selo.clients.forEach((clientId) => {
                            if (clientId === ev.from) return; // skip the joiner itself
                            if (app.pendingJoiners.has(clientId)) return; // skip other pending
                            const client = app.clients.get(clientId);
                            if (client && client.ws.readyState === 1)
                                client.ws.send(msg);
                        });
                    }
                    return null;
                }

                // Broadcast disconnect so all clients can remove the avatar
                if (ev && ev.type === 'disconnect') {
                    console.log(`[Selo ${app.seloId}] Broadcasting disconnect for ${ev.from}`);
                    const selo = app.selos.get(app.seloId);
                    if (selo) {
                        selo.clients.forEach((clientId) => {
                            if (app.pendingJoiners.has(clientId)) { app.pendingJoiners.get(clientId).buffer.push({ type: 'disconnect', from: ev.from }); return; }
                            const client = app.clients.get(clientId);
                            if (client && client.ws.readyState === 1) {
                                client.ws.send(JSON.stringify({
                                    type: 'disconnect',
                                    from: ev.from
                                }));
                            }
                        });
                    }
                    return null;
                }

                return null;
            }
        );

        // 4. TODO: The Journal (Sliding window of last 200 genuine move events) 
        // Excludes: snapshot_response (not a world event),
        //           connect {0,0} broadcasts (snapshot.objects already captures initial positions)
        const journal = Behaviors.collect(
            [], 
            immediateEcho, 
            (log, stampedMsg) => {
                if (stampedMsg && 
                    stampedMsg.type !== 'snapshot_response' &&
                    stampedMsg.type === 'move') {
                    return [...log, stampedMsg].slice(-200);
                }
                return log;
            }
        );

        // 5. Client list management
        const clientList = Behaviors.collect(
            [],
            networkMessages,
            (list, ev) => {
                if (!ev) return list;
                
                if (ev.type === 'connect') {
                    console.log(`[Selo ${app.seloId}] Client connected: ${ev.from}`);
                    return [...list, { id: ev.from, connectedAt: vTime }];
                }
                
                if (ev.type === 'disconnect') {
                    console.log(`[Selo ${app.seloId}] Client disconnected: ${ev.from}`);
                    return list.filter(c => c.id !== ev.from);
                }
                
                return list;
            }
        );

        // 6a. Join Watcher — fires AFTER clientList has settled for this tick.
        //     By triggering on Behaviors.change(clientList) instead of networkMessages,
        //     we guarantee clientList already reflects the new joiner when we read it,
        //     eliminating the same-tick evaluation-order race.
        // joinWatcher snapshot request removed — join_selo handler requests
        // snapshot directly and atomically with pendingJoiners.set().
        // Having both caused double request_snapshot → leader sent two snapshots
        // → joiner got first (stale counter), leader advanced by second → off-by-one.
        const joinWatcher = Behaviors.collect(
            { prevList: [] },
            Events.change($clientList),
            (state, newList) => ({ prevList: newList })
        );

        // 6b. Snapshot Forwarder
        const snapshotForwarder = Behaviors.collect(null, networkMessages, (_, ev) => {
            if (ev?.data?.type === 'snapshot_response') {
                const targetId=ev.data.targetUser, targetClient=app.clients.get(targetId), pending=app.pendingJoiners.get(targetId);
                if (targetClient && targetClient.ws.readyState===1 && pending) {
                    const snapTime=ev.data.payload?.time??0;
                    targetClient.ws.send(JSON.stringify({type:'snapshot_apply',snapshot:ev.data.payload,history:[],seloId:app.seloId}));
                    const toFlush=pending.buffer.filter(m=>m.type==='heartbeat'?m.vTime>=snapTime:m.type==='client_msg'?(m.data?.serverTime??0)>=snapTime:true);
                    console.log('[Selo '+app.seloId+'] snapshot->'+targetId+' snapTime='+snapTime+' flushing '+toFlush.length+'/'+pending.buffer.length);
                    for(const m of toFlush) targetClient.ws.send(JSON.stringify(m));
                    app.pendingJoiners.delete(targetId);
                }
            }
            return ev;
        });

        // 7. Heartbeat Sync - Advances virtual time even without messages
        const syncBroadcaster = Events.collect(
            { lastTime: 0 },
            pulse,
            (state, _) => {
                const currentTime = vTime;
                
                // Broadcast heartbeat every tick to advance virtual time
                const syncData = {
                    type: 'heartbeat',
                    vTime: currentTime,
                    seloId: app.seloId
                };
                
                const selo = app.selos.get(app.seloId);
                if (selo) {
                    selo.clients.forEach((clientId) => {
                        if (app.pendingJoiners.has(clientId)) { app.pendingJoiners.get(clientId).buffer.push(syncData); return; }
                        const client = app.clients.get(clientId);
                        if (client && client.ws.readyState === 1) {
                            client.ws.send(JSON.stringify(syncData));
                        }
                    });
                }
                
                // Log heartbeat every second for visibility
                if (currentTime % 1000 === 0) {
                    //console.log(`[Selo ${app.seloId}] Heartbeat at t=${currentTime}`);
                }
                
                return { lastTime: currentTime };
            }
        );

        // 8. Status logger
        const statusLogger = Events.collect(
            0,
            Behaviors.calm(pulse, 5000),
            (count) => {
                //console.log(`[Selo ${app.seloId}] Status: ${clientList.length} clients, ${journal.length} events in journal, t=${vTime}`);
                return count + 1;
            }
        );

        return { vTime, networkMessages, journal, clientList, immediateEcho, joinWatcher, snapshotForwarder, syncBroadcaster };
    }

    const programState = new ProgramState(Date.now(), reflector, true);
    programState.merge(seloProgram);
    programState.evaluator(Date.now(), { noAnimationFrame: true });
    
    selos.set(seloId, {
        programState,
        clients: new Set()
    });
    
    return selos.get(seloId);
}

function getOrCreateSelo(seloId) {
    if (!selos.has(seloId)) {
        return createSelo(seloId);
    }
    return selos.get(seloId);
}

function cleanupSelo(seloId) {
    const selo = selos.get(seloId);
    if (selo && selo.clients.size === 0) {
        console.log(`Cleaning up empty selo: ${seloId}`);
        selo.programState.stop();
        selos.delete(seloId);
    }
}

function sendToSelo(seloId, eventData) {
    const selo = selos.get(seloId);
    if (selo && selo.programState) {
        // Feed into the async generator queue — the only path into the FRP graph
        const reflector = selo.programState.app;
        if (reflector.messageResolvers.length > 0) {
            reflector.messageResolvers.shift()(eventData);
        } else {
            reflector.messageQueue.push(eventData);
        }
    }
}

wss.on('connection', (ws, req) => {
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let currentSeloId = null;
    
    console.log(`Client ${clientId} connected (not yet in a selo)`);
    clients.set(clientId, { ws, seloId: null, clientId });

    ws.on('message', (data) => {
        console.log(`📦 RAW message received from ${clientId}:`, data.toString());
        
        try {
            const message = JSON.parse(data.toString());
            console.log(`📥 Parsed message from ${clientId}:`, message.type, message);
            
            if (message.type === 'join_selo') {
                const seloId = message.seloId || 'default';
                
                if (currentSeloId) {
                    const oldSelo = selos.get(currentSeloId);
                    if (oldSelo) {
                        oldSelo.clients.delete(clientId);
                        sendToSelo(currentSeloId, {
                            type: 'disconnect',
                            from: clientId,
                            timestamp: Date.now()
                        });
                        cleanupSelo(currentSeloId);
                    }
                }
                
                const selo = getOrCreateSelo(seloId);
                selo.clients.add(clientId);
                currentSeloId = seloId;
                
                clients.set(clientId, { ws, seloId, clientId });
                
                sendToSelo(seloId, {
                    type: 'connect',
                    from: clientId,
                    timestamp: Date.now()
                });
                
                ws.send(JSON.stringify({
                    type: 'selo_joined',
                    seloId: seloId,
                    clientId: clientId,
                    clientsInSelo: selo.clients.size
                }));

                // If others are present, buffer messages for the joiner immediately
                // (so no messages are lost), but delay request_snapshot by one heartbeat
                // interval (50ms). This gives all existing members time to send their
                // _join re-announcements, which will be buffered and flushed to the
                // joiner alongside the snapshot — guaranteeing all avatars appear.
                if (selo.clients.size > 1) {
                    pendingJoiners.set(clientId, { buffer: [] });
                    const memberIds = [...selo.clients].filter(id => id !== clientId);
                    const leaderId  = memberIds[0];
                    setTimeout(() => {
                        const leaderClient = clients.get(leaderId);
                        if (!leaderClient || !pendingJoiners.has(clientId)) return;
                        if (leaderClient.ws.readyState === 1) {
                            leaderClient.ws.send(JSON.stringify({
                                type:       'request_snapshot',
                                targetUser: clientId,
                                seloId:     seloId
                            }));
                            console.log(`Requested snapshot from leader ${leaderId} for ${clientId}`);
                        }
                    }, 50);
                }

                console.log(`Client ${clientId} joined selo ${seloId} (${selo.clients.size} clients total)`);
                return;
            }
            
            if (currentSeloId) {
                sendToSelo(currentSeloId, {
                    type: 'client_msg',
                    from: clientId,
                    data: message,
                    timestamp: Date.now()
                });
            } else {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Please join a selo first'
                }));
            }
        } catch (error) {
            console.error('Invalid message format:', error);
        }
    });

    ws.on('close', () => {
        if (currentSeloId) {
            const selo = selos.get(currentSeloId);
            if (selo) {
                selo.clients.delete(clientId);
                pendingJoiners.delete(clientId);
                sendToSelo(currentSeloId, {
                    type: 'disconnect',
                    from: clientId,
                    timestamp: Date.now()
                });
                console.log(`Client ${clientId} disconnected from selo ${currentSeloId}`);
                cleanupSelo(currentSeloId);
            }
        }
        clients.delete(clientId);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for ${clientId}:`, error);
    });
});

server.listen(3000, () => {
    console.log('Reflector server running at http://localhost:3000');
    console.log('WebSocket server ready for connections');
    console.log('Usage: Send { type: "join_selo", seloId: "your-selo-id" } to join a selo');
});