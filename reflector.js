// reflector3_v7.js
// Krestianstvo SDK 4
// Changes from v6_v2:
//   - joinWatcher no longer sends request_snapshot — join_selo handler does it
//     atomically with pendingJoiners.set(). Eliminates double snapshot request
//     which caused off-by-one counter on joiner (leader sent two snapshots,
//     joiner got stale first one while leader advanced on second).
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
        startTime: Date.now(),
        messageQueue: [],
        messageResolvers: [],
        pendingJoiners
    };

    // Selo-specific reactive program
    function seloProgram() {
        const app = Renkon.app;

        // ── Clocks ──────────────────────────────────────────────────────────
        // hb: 50ms heartbeat tick.
        // timeForImmediate: receiver fired by sendToSelo for client_msg events.
        // hbOrClMsg: single source of truth — fires on either, carries vTime stamp.
        const hb = Events.timer(50);
        const timeForImmediate = Events.receiver({ queued: true });

        const hbOrClMsg = Events.collect(
            { vTime: 0, isHb: true, ev: null, stamped: null },
            Events.or(hb, timeForImmediate),
            (_, ev) => {
                const vTime = Date.now() - app.startTime;
                const isHb  = typeof ev === 'number';
                const stamped = isHb ? null : {
                    ...ev.data,
                    serverTime: vTime,
                    from: ev.from,
                    timestamp: ev.timestamp
                };
                return { vTime, isHb, ev, stamped };
            }
        );

        // vTime: wall-clock ms since selo start — same for HB and CM stamps.
        const vTime = Behaviors.collect(0, Events.change($hbOrClMsg), (_, c) => c.vTime);

        // ── Network messages (connect / disconnect / snapshot) ───────────────
        // These are lower-frequency management events — generator stream is fine.
        const networkMessagesGen = (async function* () {
            while (true) {
                const message = await new Promise((resolve) => {
                    if (app.messageQueue.length > 0) resolve(app.messageQueue.shift());
                    else app.messageResolvers.push(resolve);
                });
                yield message;
            }
        })();
        const networkMessagesRaw = Events.next(networkMessagesGen);
        const networkMessages = Behaviors.collect(
            null, networkMessagesRaw,
            (_, r) => (r && !r.done) ? r.value : null
        );

        // 3. IMMEDIATE ECHO
        // client_msg: comes from hbOrClMsg (already stamped with serverTime=vTime).
        // connect/disconnect/snapshot: come from networkMessages generator stream.
        const immediateEcho = Behaviors.collect(
            null,
            Events.or(timeForImmediate, networkMessagesRaw),
            (_, incoming) => {
                // timeForImmediate is queued — may be array; networkMessagesRaw is a generator result
                const isArr = Array.isArray(incoming);
                const evList = isArr ? incoming
                             : (incoming && incoming.value) ? [incoming.value]
                             : incoming ? [incoming] : [];
                if (!evList.length) return null;
                let last = null;
                for (const ev of evList) {
                    if (!ev) continue;

                if (ev.type === 'client_msg') {
                    if (ev.data?.type === 'snapshot_response') { last = null; continue; }
                    const stampedMessage = {
                        ...ev.data, serverTime: Date.now() - app.startTime, from: ev.from, timestamp: ev.timestamp
                    };
                    const selo = app.selos.get(app.seloId);
                    if (selo) {
                        let sent = 0;
                        selo.clients.forEach((clientId) => {
                            if (app.pendingJoiners.has(clientId)) { app.pendingJoiners.get(clientId).buffer.push({ type: 'client_msg', data: stampedMessage, from: ev.from }); return; }
                            const client = app.clients.get(clientId);
                            if (client && client.ws.readyState === 1) {
                                client.ws.send(JSON.stringify({ type: 'client_msg', data: stampedMessage, from: ev.from }));
                                sent++;
                            }
                        });
                    }
                    last = stampedMessage; continue;
                }

                // Broadcast a stamped {0,0} move for the new client so all existing
                // peers see the avatar appear immediately without waiting for a click.
                if (ev.type === 'connect') {
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
                    last = null; continue;
                }

                // Broadcast disconnect so all clients can remove the avatar
                if (ev.type === 'disconnect') {
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
                    last = null; continue;
                }
                } // end for loop
                return last;
            }
        );

        // 4. The Journal (Sliding window of last 200 genuine move events)
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
                    console.log('[flush]', toFlush.map(m => m.type==='heartbeat' ? 'HB@'+m.vTime : 'CM@'+(m.data&&m.data.serverTime)));
                    for(const m of toFlush) targetClient.ws.send(JSON.stringify(m));
                    app.pendingJoiners.delete(targetId);
                }
            }
            return ev;
        });

        // 7. Heartbeat Sync - Advances virtual time even without messages
        const syncBroadcaster = Events.collect(
            { lastTime: 0 },
            hb,
            (state, _) => {
                const currentTime = hbOrClMsg ? hbOrClMsg.vTime : (Date.now() - app.startTime);
                // Broadcast heartbeat every tick to advance virtual time
                const syncData = {
                    type: 'heartbeat',
                    vTime: currentTime,
                    seloId: app.seloId
                };
                
                const selo = app.selos.get(app.seloId);
                if (selo) {
                    selo.clients.forEach((clientId) => {
                        if (app.pendingJoiners.has(clientId)) { app.pendingJoiners.get(clientId).buffer.push(syncData); console.log('[buffer HB] vTime='+syncData.vTime); return; }
                        const client = app.clients.get(clientId);
                        if (client && client.ws.readyState === 1) {
                            client.ws.send(JSON.stringify(syncData));
                        }
                    });
                }
                
                console.log(`[reflector out] HB vTime=${currentTime} clients=${selo ? selo.clients.size : 0}`);
                
                return { lastTime: currentTime };
            }
        );

        // 8. Status logger
        const statusLogger = Events.collect(
            0,
            Behaviors.calm(hb, 5000),
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
        try { selo.programState.stop(); } catch(e) { console.error('[cleanupSelo] stop() failed:', e); }
        selos.delete(seloId);
    }
}

function sendToSelo(seloId, eventData) {
    const selo = selos.get(seloId);
    if (selo && selo.programState) {
        const reflector = selo.programState.app;
        if (eventData.type === 'client_msg' && eventData.data?.type !== 'snapshot_response') {
            // Fire into timeForImmediate receiver — Events.or with hb, same vTime timeline.
            selo.programState.registerEvent('timeForImmediate', eventData);
        } else {
            // connect / disconnect / snapshot go via generator queue
            if (reflector.messageResolvers.length > 0) reflector.messageResolvers.shift()(eventData);
            else reflector.messageQueue.push(eventData);
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
                        if (!pendingJoiners.has(clientId)) return;
                        const liveMember = memberIds.find(id => {
                            const c = clients.get(id);
                            return c && c.ws.readyState === 1;
                        });
                        if (!liveMember) { pendingJoiners.delete(clientId); return; }
                        clients.get(liveMember).ws.send(JSON.stringify({
                            type: 'request_snapshot', targetUser: clientId, seloId
                        }));
                        console.log(`Requested snapshot from leader ${liveMember} for ${clientId}`);
                    }, 50);
                }

                console.log(`Client ${clientId} joined selo ${seloId} (${selo.clients.size} clients total)`);
                return;
            }
            
            if (message.type === 'goodbye') {
                console.log(`[goodbye] client ${clientId} signing off from ${currentSeloId}`);
                if (currentSeloId) {
                    const selo = selos.get(currentSeloId);
                    if (selo) {
                        selo.clients.delete(clientId);
                        pendingJoiners.delete(clientId);
                        sendToSelo(currentSeloId, { type: 'disconnect', from: clientId, timestamp: Date.now() });
                        cleanupSelo(currentSeloId);
                    }
                }
                clients.delete(clientId);
                currentSeloId = null;
                ws.terminate();
                return;
            }

            if (currentSeloId) {
                sendToSelo(currentSeloId, {
                    type: 'client_msg',
                    from: clientId,
                    data: message,
                    timestamp: Date.now(),
                    _arrivedAt: Date.now()   // wall-clock at actual WS message arrival
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
        console.log(`[ws.close] client=${clientId} selo=${currentSeloId}`);
        if (currentSeloId) {
            const selo = selos.get(currentSeloId);
            if (selo) {
                selo.clients.delete(clientId);
                pendingJoiners.delete(clientId);
                console.log(`Client ${clientId} disconnected from selo ${currentSeloId}, remaining clients: ${selo.clients.size}`);
                sendToSelo(currentSeloId, {
                    type: 'disconnect',
                    from: clientId,
                    timestamp: Date.now()
                });
                cleanupSelo(currentSeloId);
            } else {
                console.log(`Client ${clientId} disconnected but selo ${currentSeloId} not found`);
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