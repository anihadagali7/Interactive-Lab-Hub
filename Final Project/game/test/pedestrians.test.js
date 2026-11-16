import test from 'node:test';
import assert from 'node:assert/strict';
import { Pedestrians, optionsFrom } from '../src/pedestrians.js';
import { N, BLOCK, blockMin, mulberry32 } from '../src/layout.js';
import { signal, hasSignal } from '../src/signals.js';

const onABlock = p => {
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (p.x >= blockMin(i) && p.x <= blockMin(i) + BLOCK && p.z >= blockMin(j) && p.z <= blockMin(j) + BLOCK) return true;
  }
  return false;
};
/** Off the block, a person must be in a zebra's strip: 1.3 to 3.9 m inside a block-edge line on the axis they are not walking along. */
const insideZebra = p => {
  const near = v => { let best = Infinity; for (let b = 0; b < N; b++) for (const e of [blockMin(b), blockMin(b) + BLOCK]) best = Math.min(best, Math.abs(v - e)); return best; };
  const ok = inset => inset >= 1.3 && inset <= 3.9;
  return ok(near(p.x)) || ok(near(p.z));
};

test('corner options: two along the block, plus a crossing for each neighbouring block', () => {
  assert.equal(optionsFrom({ i: 0, j: 0, cx: 0, cz: 0 }).length, 2);          // map corner: nowhere to cross to
  assert.equal(optionsFrom({ i: 0, j: 0, cx: 1, cz: 0 }).length, 3);
  assert.equal(optionsFrom({ i: 2, j: 3, cx: 1, cz: 1 }).length, 4);
  const east = optionsFrom({ i: 2, j: 3, cx: 1, cz: 1 }).find(o => o.to.i === 3);
  assert.deepEqual(east.to, { i: 3, j: 3, cx: 0, cz: 1 });
  assert.deepEqual(east.cross, { node: [3, 4], walkAxis: 'ew' });
});

test('ten minutes on foot: people stay on pavements and zebras, and only step off on a walk signal', () => {
  const crowd = new Pedestrians(46, mulberry32(11));
  let crossings = 0;
  const moved = new Map(crowd.people.map(p => [p, 0]));
  for (let t = 0; t < 600; t += 0.05) {
    const before = crowd.people.map(p => [p.state, p.x, p.z]);
    crowd.update(0.05);
    crowd.people.forEach((p, k) => {
      moved.set(p, moved.get(p) + Math.hypot(p.x - before[k][1], p.z - before[k][2]));
      if (p.state === 'cross') {
        assert.ok(onABlock(p) || insideZebra(p), `crossing on the zebra at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
        if (before[k][0] !== 'cross') {
          crossings++;
          const { node, walkAxis } = p.next.cross, roadAxis = walkAxis === 'ew' ? 'ns' : 'ew';
          if (hasSignal(node[0], node[1])) assert.equal(signal(node[0], node[1], roadAxis, crowd.time), 'red', 'traffic on the road being crossed has red');
        }
      } else assert.ok(onABlock(p), `on a pavement at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) while ${p.state}`);
    });
  }
  console.log(`crossings ${crossings}, least walked ${Math.min(...moved.values()).toFixed(0)} m`);
  assert.ok(crossings > 150);
  assert.ok(Math.min(...moved.values()) > 150, 'everyone keeps walking');
});

test('a fast car knocks a person down; a near miss scares them; a crawl does neither', () => {
  const crowd = new Pedestrians(1, mulberry32(2));
  const p = crowd.people[0];
  const carAt = (dx, speed) => ({ x: p.x + dx, z: p.z, fx: 0, fz: 1, vx: 0, vz: speed, speed });
  assert.deepEqual(crowd.checkCar(carAt(0, 2)), { hits: 0, scares: 0 });
  assert.deepEqual(crowd.checkCar(carAt(2.6, 12)), { hits: 0, scares: 1 });
  assert.deepEqual(crowd.checkCar(carAt(2.6, 12)), { hits: 0, scares: 0 }, 'not scared twice in a row');
  assert.deepEqual(crowd.checkCar(carAt(0, 12)), { hits: 1, scares: 0 });
  assert.equal(p.state, 'down');
  for (let t = 0; t < 8; t += 0.05) crowd.update(0.05);
  assert.notEqual(p.state, 'down', 'back on their feet somewhere else');
});
