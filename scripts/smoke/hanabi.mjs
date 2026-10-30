import { enterGame, findJournal, connect } from "./_harness.mjs";
export default async function run({ A, B, waitUntil, assert, ticketA, ticketB, api }) {
  await enterGame({ A, B, waitUntil, gameId:"hanabi", ready:()=>A.game()?.phase==="playing"&&B.game()?.phase==="playing" });
  const clients=[A,B];
  function hidden() { for(let seat=0;seat<2;seat++){ const d=clients[seat].game();assert(!("deck" in d)&&!("seed" in d),"hanabi deck is server-only");assert(d.hands[seat].every(c=>!("color" in c)&&!("rank" in c)),"hanabi own faces absent on wire");assert(d.hands[1-seat].every(c=>c.color&&c.rank),"hanabi partner visible"); } }
  const send=(client,a)=>client.act({run:client.state.game.run,turnNumber:client.game().turnNumber,...a});
  hidden();
  const oldRun=A.state.game.run;
  const ownCard=A.game().hands[0][0].id;
  const startErrors=B.errors.length;
  send(B,{type:"play",cardId:B.game().hands[1][0].id});
  await waitUntil(()=>B.errors.length>startErrors,"hanabi wrong turn rejection");
  assert(A.game().turnNumber===0,"wrong turn unchanged");
  const clue=A.game().hands[1][0].color;
  send(A,{type:"hint",kind:"color",value:clue});
  await waitUntil(()=>A.game().turnNumber===1&&B.game().turnNumber===1,"hanabi hint synchronized");
  B.game().hands[1].forEach(c=> {const actual=A.game().hands[1].find(x=>x.id===c.id);assert(actual.color===clue?c.knowledge.colors.length===1&&c.knowledge.colors[0]===clue:!c.knowledge.colors.includes(clue),"positive and negative knowledge");});
  hidden();
  // 断线时不得偷偷继续回合；新欢迎帧也必须经过按座位脱敏。
  B.ws.close();
  await waitUntil(()=>!A.state.seats[1].connected,"hanabi disconnect");
  const C=connect(ticketB);
  await waitUntil(()=>C.game()?.turnNumber===1,"hanabi resume welcome");
  // 保留外层 smoke 的 B 引用，让后续通用测试仍用新连接。
  Object.defineProperty(B,"state",{configurable:true,get:()=>C.state});
  Object.defineProperty(B,"errors",{configurable:true,get:()=>C.errors});
  B.ws=C.ws; B.send=C.send; B.act=C.act; B.reactions=C.reactions; B.ink=C.ink; B.inkSyncs=C.inkSyncs;
  hidden();
  A.ws.close();
  await waitUntil(()=>!B.state.seats[0].connected,"hanabi partner offline");
  const offlineErrors=B.errors.length;
  send(B,{type:"hint",kind:"rank",value:B.game().hands[0][0].rank});
  await waitUntil(()=>B.errors.length>offlineErrors,"hanabi cannot act during disconnect");
  assert(B.game().turnNumber===1,"hanabi offline action unchanged");
  const A2=connect(ticketA);
  await waitUntil(()=>A2.game()?.turnNumber===1&&B.state.seats[0].connected,"hanabi reconnect actor partner");
  Object.defineProperty(A,"state",{configurable:true,get:()=>A2.state});
  Object.defineProperty(A,"errors",{configurable:true,get:()=>A2.errors});
  A.ws=A2.ws; A.send=A2.send; A.act=A2.act; A.reactions=A2.reactions; A.ink=A2.ink; A.inkSyncs=A2.inkSyncs;
  hidden();
  // 测试机器人由伙伴的合法可见信息选牌；不读取服务端隐藏状态。
  for(let steps=0;A.game().phase!=="over"&&steps<160;steps++) {
    const d=A.game(), seat=d.turn, client=clients[seat], visible=clients[1-seat].game().hands[seat];
    const playable=visible.find(c=>d.fireworks[c.color]+1===c.rank);
    if(playable) send(client,{type:"play",cardId:playable.id});
    else if(d.hints<8) send(client,{type:"discard",cardId:client.game().hands[seat][0].id});
    else send(client,{type:"hint",kind:"rank",value:client.game().hands[1-seat][0].rank});
    await waitUntil(()=>A.game().turnNumber>d.turnNumber&&B.game().turnNumber>d.turnNumber,"hanabi next action");
    hidden();
  }
  assert(A.game().phase==="over","hanabi full game finishes");
  assert(A.game().fuses===3,"hanabi legal full game no strike");
  assert(A.game().score===25||A.game().finalTurns===0,"hanabi perfect or final two turns");
  await waitUntil(()=>findJournal(A,"hanabi"),"hanabi journal");
  const hist=await api(`rooms/${ticketA.code}/history`,{headers:{Authorization:`Bearer ${ticketA.token}`}});
  assert(hist.status===200&&hist.data.entries.some(e=>e.gameId==="hanabi"),"hanabi persisted history");
  const entry=hist.data.entries.find(e=>e.gameId==="hanabi");
  assert(!JSON.stringify(entry).includes('"hands"')&&!JSON.stringify(entry).includes('"deck"'),"history excludes hidden data");
  A.send({type:"start"});
  await waitUntil(()=>A.state.game.run!==oldRun&&A.game().turnNumber===0&&B.game().turnNumber===0,"hanabi fresh restart");
  hidden();
  assert(A.game().hints===8&&A.game().deckCount===40,"hanabi fresh state");
  const errors=A.errors.length;
  A.act({type:"play",cardId:ownCard,run:oldRun,turnNumber:0});
  await waitUntil(()=>A.errors.length>errors,"hanabi old-run action rejected");
  assert(A.game().turnNumber===0,"hanabi stale action cannot affect new run");
  console.log("done: hanabi both-seat secrecy / truthful clues / reconnect / full finish / history / restart / stale guard");
}
