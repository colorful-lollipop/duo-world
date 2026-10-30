import { describe, it, expect } from 'vitest';
import pong from '../../server/games/ping-pong.mjs';
import { makeRoom, startGame } from './_room.mjs';
function setup(target = 5) {
  const room = makeRoom({ gameId: 'ping-pong', settings: { 'ping-pong': { target } } });
  room.seats.forEach(s => s.ws = { readyState: 1 });
  const d = startGame(room); d.lastTickAt = 10000;
  return { room, d };
}
function play(room, now = 10000) {
  pong.action(room, 0, { type: 'ready' }, now);
  pong.action(room, 1, { type: 'ready' }, now);
  pong.tick(room, now + 1500);
}
const move = (d, y, at = 12000) => ({ type: 'move', y, epoch: d.epoch, at });
describe('心动乒乓 · authoritative physics', () => {
  it('isolates rooms and validates settings; fresh starts clear scores', () => {
    const a = setup(), b = setup(10), bad = setup(Infinity);
    a.d.scores[0] = 3; a.d.paddles[0] = 55;
    expect(b.d.scores).toEqual([0, 0]); expect(b.d.paddles[0]).toBe(300);
    expect(b.d.target).toBe(10); expect(bad.d.target).toBe(5);
    expect(pong.create(a.room).scores).toEqual([0, 0]);
  });
  it('requires both ready and keeps ball still during countdown', () => {
    const {room,d} = setup();
    pong.action(room,0,{type:'ready'},10000); expect(d.phase).toBe('ready');
    pong.action(room,1,{type:'ready'},10000); expect(d.phase).toBe('countdown');
    pong.tick(room,11000); expect(d.ball.x).toBe(500);
    pong.tick(room,11500); expect(d.phase).toBe('playing'); expect(d.ball.x).toBe(500);
    pong.tick(room,11600); expect(d.ball.x).toBeCloseTo(542);
  });
  it('limits paddle speed and bounds; a seat can only move its own paddle', () => {
    const {room,d} = setup(); play(room);
    expect(pong.action(room,0,{...move(d,0),seat:1},12000)).toBeNull();
    expect(d.paddles).toEqual([300,300]);
    pong.tick(room,11600); expect(d.paddles).toEqual([210,300]);
    pong.tick(room,11800); expect(d.paddles[0]).toBe(55);
  });
  it.each([NaN,Infinity,-1,601,'300',null,{},undefined])('rejects invalid y %s', y => {
    const {room,d} = setup(); play(room);
    expect(pong.action(room,0,move(d,y),12000)).toBeTypeOf('string');
    expect(d.targets).toEqual([300,300]);
  });
  it('rejects invalid seats, old epochs, old/future/nonfinite/reordered timestamps, unknown actions', () => {
    const {room,d} = setup(); play(room);
    for (const action of [{...move(d,0),epoch:-1},move(d,0,1),move(d,0,13000),move(d,0,NaN),{type:'score',winner:0}])
      expect(pong.action(room,0,action,12000)).toBeTypeOf('string');
    expect(pong.action(room,2,move(d,0),12000)).toBeTypeOf('string');
    pong.action(room,0,move(d,0),12000);
    expect(pong.action(room,0,move(d,600,11990),12000)).toBeTypeOf('string');
    pong.action(room,0,move(d,600,12010),12010); expect(d.targets[0]).toBe(55);
  });
  it('reflects walls, collides from correct direction, applies spin and caps speed', () => {
    const {room,d} = setup(); play(room);
    d.ball = {x:100,y:11,vx:420,vy:-300}; pong.tick(room,11510);
    expect(d.ball.y).toBeGreaterThanOrEqual(10); expect(d.ball.vy).toBeGreaterThan(0);
    d.ball = {x:70,y:330,vx:-850,vy:0}; pong.tick(room,11520);
    expect(d.ball.vx).toBeGreaterThan(0); expect(d.ball.vy).toBeGreaterThan(0);
    expect(Math.hypot(d.ball.vx,d.ball.vy)).toBeLessThanOrEqual(850.000001);
    expect(d.rally).toBe(1); expect(d.bestRally).toBe(1);
    d.ball = {x:66,y:300,vx:420,vy:0}; pong.tick(room,11530); expect(d.rally).toBe(1);
  });
  it('scores, resets serve, ends exactly once, records standard wins and summary', () => {
    const {room,d} = setup(); play(room);
    d.ball = {x:1011,y:20,vx:420,vy:0}; pong.tick(room,11510);
    expect(d.scores).toEqual([1,0]); expect(d.phase).toBe('countdown'); expect(d.ball.x).toBe(500);
    d.phase='playing'; d.scores[0]=4; d.ball={x:1011,y:20,vx:420,vy:0}; pong.tick(room,11520);
    expect(d.phase).toBe('over'); expect(d.winner).toBe(0); expect(d.wins).toEqual([1,0]);
    expect(pong.tick(room,20000)).toBe(false);
    expect(pong.action(room,1,{type:'resign'},20000)).toBeTypeOf('string');
    expect(room.stats.wins['ping-pong']).toEqual([1,0]);
    expect(pong.summary(room).data).toEqual({winner:0,scores:[5,0],bestRally:0});
  });
  it('pauses on loss, freezes score/ball, rejects old input and requires BOTH ready on reconnect', () => {
    const {room,d} = setup(); play(room); const epoch=d.epoch;
    room.seats[1].ws=null; expect(pong.tick(room,11600)).toBe(true);
    expect(d.phase).toBe('paused'); expect(d.epoch).toBe(epoch+1);
    const ball={...d.ball}; pong.tick(room,50000); expect(d.ball).toEqual(ball);
    expect(pong.action(room,0,{type:'ready'},50000)).toBeTypeOf('string');
    room.seats[1].ws={readyState:1};
    pong.action(room,0,{type:'ready'},50000); expect(d.phase).toBe('paused');
    pong.action(room,1,{type:'ready'},50000); expect(d.phase).toBe('countdown');
    expect(pong.action(room,0,{...move(d,0,50000),epoch},50000)).toBeTypeOf('string');
    pong.tick(room,51500); expect(d.phase).toBe('playing'); expect(d.ball).toEqual(ball);
  });
  it('caps long catchup and uses identical fixed steps across tick schedules', () => {
    const a=setup(),b=setup(); play(a.room);play(b.room);
    pong.tick(a.room,11600); for(let t=11510;t<=11600;t+=10)pong.tick(b.room,t);
    expect(a.d.ball).toEqual(b.d.ball);
    a.d.ball={x:500,y:300,vx:420,vy:120}; pong.tick(a.room,10000000);
    expect(a.d.ball.x).toBeCloseTo(605);
  });
});
