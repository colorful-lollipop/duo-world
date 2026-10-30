import { enterGame, findJournal, connect } from './_harness.mjs';
export default async function run({ A, B, waitUntil, assert, sleep, api }) {
  await enterGame({A,B,waitUntil,gameId:'ping-pong',settings:{target:5},ready:()=>A.game()?.phase==='ready'});
  A.act({type:'ready'}); B.act({type:'ready'});
  await waitUntil(()=>A.game().phase==='playing','pong start');
  A.send({type:'action',transient:'ping-pong',action:{type:'move',y:0,epoch:A.game().epoch,at:Date.now()}});
  B.act({type:'move',y:0,epoch:B.game().epoch,at:Date.now()});
  await waitUntil(()=>A.game().paddles.every(y=>y===55),'pong bounded movement');
  A.act({type:'move',y:9999,epoch:A.game().epoch,at:Date.now()});
  await waitUntil(()=>A.errors.some(e=>e.includes('球拍位置无效')),'pong reject malicious position');
  // Both paddles remain at top; normal physics produces goals, no test-only score API.
  await waitUntil(()=>A.game().scores.some(s=>s>0),'pong actual goal',10000);
  await waitUntil(()=>A.game().phase==='over','pong score limit',30000);
  assert(A.game().scores.includes(5),'pong winning score');
  await waitUntil(()=>findJournal(A,'ping-pong'),'pong journal');
  assert(A.state.stats.wins['ping-pong'].reduce((a,b)=>a+b,0)===1,'pong wins once');
  A.send({type:'start'}); await waitUntil(()=>A.game()?.phase==='ready','pong reset');
  assert(A.game().scores.every(s=>s===0),'pong clean scores');
  A.act({type:'resign'}); await waitUntil(()=>A.game().phase==='over','pong resign');
  assert(A.game().winner===1,'pong resign winner');

  // Separate real room: reconnect without replacing the shared smoke clients.
  const profile={nickname:'Pong',avatar:'bunny',color:'#FF6B6B'};
  const ta=(await api('rooms',{method:'POST',body:JSON.stringify({profile})})).data;
  const tb=(await api(`rooms/${ta.code}/join`,{method:'POST',body:JSON.stringify({profile})})).data;
  const x=connect(ta);let y=connect(tb);
  try {
    await waitUntil(()=>x.state&&y.state&&x.state.seats.every(s=>s.connected),'pong isolated room');
    await enterGame({A:x,B:y,waitUntil,gameId:'ping-pong'});
    x.act({type:'ready'});y.act({type:'ready'});
    await waitUntil(()=>x.game().phase==='playing','pong reconnect start');
    const epoch=x.game().epoch; y.ws.close();
    await waitUntil(()=>x.game().phase==='paused','pong disconnect pause');
    const before=JSON.stringify(x.game().ball); await sleep(250);
    assert(JSON.stringify(x.game().ball)===before,'pong pause freezes ball');
    y=connect(tb); await waitUntil(()=>y.state&&x.state.seats[1].connected,'pong reconnect');
    x.act({type:'ready'});y.act({type:'ready'});
    await waitUntil(()=>x.game().phase==='playing','pong resume');
    x.act({type:'move',y:0,epoch,at:Date.now()});
    await waitUntil(()=>x.errors.some(e=>e.includes('过期')),'pong stale epoch rejected');
    assert(x.game().scores.every(s=>s===0),'pong score preserved on resume');
  } finally { x.ws.close(); y.ws.close(); }
  console.log('done: ping-pong movement / validation / goals / score limit / journal / stats / restart / resign / disconnect + reconnect');
}
