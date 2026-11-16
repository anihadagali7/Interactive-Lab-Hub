// Rider conversations. Today this is a scripted stand-in: the rider says a line and the
// driver picks one of three replies with the 1/2/3 keys. Each reply carries a score from
// 1 (rude) to 5 (kind), and the scores feed the conversation part of the rating.
//
// The voice version (microphone -> Qwen -> Piper on the Pi) replaces this class and keeps
// the same four methods: start(rider), update(dt), react(kind), stop() -> scores.

const REPLY_SECONDS = 9;
const FIRST_LINE_AFTER = 2.5;
const GAP_BETWEEN_LINES = 7;
const IGNORED_SCORE = 2;          // saying nothing is worse than a neutral reply

// Each prompt: what the rider says, then [reply, score, rider's reaction] for kind / neutral / rude.
export const RIDERS = [
  {
    name: 'Maya', color: '#e5484d', shirt: 0xe5484d, rating: 4.9,
    prompts: [
      ["Hey! Thanks for coming so fast. I'm so late for my exam.", [
        ["No stress, I'll get you there. What's the exam on?", 5, 'Organic chem. Pray for me.'],
        ['OK.', 3, 'Right. Okay.'],
        ["Not my problem you're late.", 1, 'Wow. Okay.']]],
      ['Do you like driving in this city?', [
        ['Love it. I know every shortcut.', 5, "That's what I like to hear!"],
        ["It's a job.", 3, 'Fair enough.'],
        ['Not with passengers who talk this much.', 1, '...Noted.']]],
      ['Any tips for staying calm before a test?', [
        ["Deep breath. You've studied, you've got this.", 5, 'Thanks, I needed that.'],
        ['Not really.', 3, 'Oh. Okay.'],
        ["Should've studied more.", 1, 'Rude.']]],
    ],
  },
  {
    name: 'Mr. Okafor', color: '#3e63dd', shirt: 0x2b3a67, rating: 4.6,
    prompts: [
      ["Morning. I have a board meeting, so let's keep it moving.", [
        ['Understood. Quickest route, coming up.', 5, 'Good. I like efficiency.'],
        ['Sure.', 3, 'Hm.'],
        ['I drive how I drive.', 1, 'I see. Charming.']]],
      ['Is this traffic normal?', [
        ["It's a little heavy. I'll work around it.", 5, 'Appreciated.'],
        ['Pretty much.', 3, 'Wonderful.'],
        ["If you don't like it, walk.", 1, 'Unbelievable.']]],
      ['Do you mind if I take a call?', [
        ["Go ahead, I'll keep it smooth.", 5, 'Thank you.'],
        ['Whatever you want.', 3, 'Right.'],
        ['Keep it quiet back there.', 1, 'Excuse me?']]],
    ],
  },
  {
    name: 'Rosa', color: '#d6409f', shirt: 0xc86fa9, rating: 5.0,
    prompts: [
      ['Hello dear! Would you take me nice and gently?', [
        ['Of course. Smooth as butter.', 5, "Oh, you're a sweetheart."],
        ["I'll try.", 3, 'Well, all right.'],
        ["I've got places to be, lady.", 1, 'Oh my.']]],
      ['My grandson drives one of these. Do you have family in town?', [
        ["I do! They're the reason I love this job.", 5, 'How lovely.'],
        ['Some.', 3, 'I see.'],
        ["That's kind of personal.", 1, 'I was only asking...']]],
      ['Would you like a butterscotch candy?', [
        ["I'd love one, thank you!", 5, 'Here you go, dear.'],
        ['No thanks.', 3, 'More for me.'],
        ["Don't put candy in my car.", 1, 'Goodness.']]],
    ],
  },
  {
    name: 'Dex', color: '#f76b15', shirt: 0xf76b15, rating: 4.7,
    prompts: [
      ['First time in the city! What should I see?', [
        ['Central Park, then a slice at Pixel Pizza. Trust me.', 5, 'Writing that down!'],
        ["There's some stuff around.", 3, 'Okay... cool.'],
        ["I'm a driver, not a tour guide.", 1, 'Yikes.']]],
      ['Whoa, is that the Tech Tower?', [
        ['Tallest in town! The view from the top is amazing.', 5, 'So cool!'],
        ['Yeah.', 3, 'Neat.'],
        ["Quiet, buddy, I'm driving.", 1, '...Sorry.']]],
      ['Can I get a photo of us for my blog?', [
        ['Ha, sure. At the next stop!', 5, "You're the best!"],
        ['Maybe.', 3, 'Okay.'],
        ['Absolutely not.', 1, 'Tough crowd.']]],
    ],
  },
  {
    name: 'Priya', color: '#30a46c', shirt: 0x4fb39a, rating: 4.8,
    prompts: [
      ["Long night shift. Mind if it's a quiet ride?", [
        ["Not at all. Rest up, I've got you.", 5, 'Thank you. Really.'],
        ['Fine.', 3, 'Thanks.'],
        ["Good, I didn't want to talk anyway.", 1, 'Okay then.']]],
      ['Sorry, did I doze off? Are we close?', [
        ['Almost there. You earned that nap.', 5, "You're kind."],
        ['A few more minutes.', 3, 'Okay.'],
        ['You were snoring.', 1, 'Wow.']]],
      ['Do you ever work nights?', [
        ['Sometimes. Respect to you, nights are tough.', 5, 'They are. Thanks.'],
        ['Sometimes.', 3, 'Mm.'],
        ['Nope. That sounds miserable.', 1, 'It is. Thanks for that.']]],
    ],
  },
  {
    name: 'Leo', color: '#8e4ec6', shirt: 0x8e4ec6, rating: 4.5,
    prompts: [
      ['Big game today! You following the City Comets?', [
        ["Of course! Think they'll win it?", 5, 'By ten points, easy!'],
        ['A bit.', 3, 'Oh. Okay.'],
        ['Sports are a waste of time.', 1, 'Whoa. Harsh.']]],
      ['Mind if I turn up the radio?', [
        ['Go for it, good tunes help.', 5, "Now we're talking!"],
        ['If you must.', 3, 'All right.'],
        ['Touch nothing.', 1, 'Jeez.']]],
      ['You ever been to a game?', [
        ['Loved it. The crowd is electric.', 5, 'Right?!'],
        ['Once.', 3, 'Cool.'],
        ["I'd rather watch paint dry.", 1, 'Wow.']]],
    ],
  },
];

const REACTIONS = {
  bump: ['Whoa! Careful!', 'Hey, watch it!', 'Easy there!', 'Was that a kerb?'],
  crash: ['Are you trying to kill us?!', 'Let me out of this car!', 'Oh my gosh!', 'My neck!'],
  nitro: ["Whoa, okay, we're flying!", 'Is that... legal?', 'Woooo!'],
  silence: ['Hello? ...Okay then.', "Guess you're not a talker.", '...'],
};

/** What the rider says as they get out, by overall rating. */
export function farewell(overall) {
  if (overall >= 4.5) return 'Best ride all week. Thank you!';
  if (overall >= 3.5) return 'Thanks for the ride.';
  if (overall >= 2.5) return 'Well. We got here.';
  return 'Never again.';
}

const pick = list => list[Math.floor(Math.random() * list.length)];
const shuffled = list => list.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(p => p[1]);

export class Chat {
  constructor(hud, input, audio) {
    this.hud = hud; this.audio = audio;
    this.rider = null;
    for (const n of [1, 2, 3]) input.onPress(`reply${n}`, () => this.reply(n - 1));
  }

  start(rider) {
    this.rider = rider;
    this.scores = [];
    this.queue = shuffled(rider.prompts);
    this.options = null;           // replies on offer right now, or null
    this.wait = FIRST_LINE_AFTER;  // seconds until the rider speaks next
    this.replyLeft = 0;
    this.saidNitro = false;
  }

  update(dt) {
    if (!this.rider) return;
    if (this.options) {
      this.replyLeft -= dt;
      this.hud.setReplyTimer(Math.max(0, this.replyLeft / REPLY_SECONDS));
      if (this.replyLeft <= 0) this.finish(IGNORED_SCORE, pick(REACTIONS.silence));
      return;
    }
    this.wait -= dt;
    if (this.wait <= 0 && this.queue.length) this.ask(this.queue.shift());
  }

  ask([line, replies]) {
    this.options = shuffled(replies);
    this.replyLeft = REPLY_SECONDS;
    this.hud.showChat(this.rider, line);
    this.hud.setReplies(this.options.map(o => o[0]));
    this.audio.chime('chat');
  }

  reply(index) {
    if (!this.options || !this.options[index]) return;
    const [, score, reaction] = this.options[index];
    this.finish(score, reaction);
  }

  finish(score, reaction) {
    this.scores.push(score);
    this.options = null;
    this.wait = GAP_BETWEEN_LINES;
    this.hud.showChat(this.rider, reaction);
    this.hud.setReplies([]);
  }

  /** The rider comments on the driving. kind: bump | crash | nitro */
  react(kind) {
    if (!this.rider || this.options) return;     // never talk over an open question
    if (kind === 'nitro') { if (this.saidNitro) return; this.saidNitro = true; }
    this.hud.showChat(this.rider, pick(REACTIONS[kind]));
    this.hud.setReplies([]);
    this.wait = Math.max(this.wait, 3);
  }

  /** End the conversation and hand back the reply scores. */
  stop() {
    const scores = this.scores || [];
    this.rider = null; this.options = null;
    this.hud.hideChat();
    return scores;
  }
}
