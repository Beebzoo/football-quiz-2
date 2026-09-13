#!/bin/sh
# Screenshot One on One at phone width, in whatever state you name.
#
#   sh _tools/shot-h2h.sh out.png [scale] [state] [scrollpx] [scrubms]
#
#   scrollpx  shift the app up inside the frame, to inspect something that
#             falls below the fold at a high scale
#   scrubms   pause every animation on the page and set it to this millisecond.
#             The only reliable way to frame a moving thing: headless virtual
#             time renders a mid-animation frame from a clock the main thread
#             does not share, so the late-firing states below land wherever
#             they land. Scrubbed is exact. The scrub happens 2800ms after the
#             state is set up and everything has to be over well inside the
#             5000ms budget or the scrubbed frame is never drawn, so the states
#             built for it (inflight chalgo run runw runlost) fire at 2500. The
#             older late states (strike save goal foul) still fire at 3500 and
#             up and are caught by luck, as they always were.
#
#   scale   1.0 to inspect detail, .6 to see a whole phone screen
#   state   the menu:    menu modes setup setupb board qcard clubs clubpitch
#           kicking off: teams toss flip landed pick sel att flat nl it
#           the tackle:  hand mark chal chalgo chalfar chalflat foul cards
#           the press:   heat press
#           a ball:      inflight run runw runlost
#           a shot:      shot strike save goal
#           the bench:   sub subgk
#           the end:     ft pens penq over pensend
#           pick one:    mcq
#
#           press is the three-short-balls contest; chal* is the mark-based
#           tackle. Two different rules that both land on h_tackle.
#
# WHY THIS EXISTS. One on One is the only thing in the repo that cannot be
# checked by reading it. Four separate bugs in this mode were invisible in the
# code and obvious in a picture: a stage with max-width but no width collapsed
# the pitch to nothing; overflow:hidden silently flattened the 3D and laid the
# players down instead of standing them up; the men were built out of spans, so
# every part of them ignored width and height; and the side nets were rotated
# towards the camera, splaying out past the posts like wings. Every one of them
# took seconds to spot once rendered.
#
# Two things this repo learned the hard way, both worked around here: headless
# Edge ignores --window-size (it always renders about 492x485), so the app is
# loaded inside a fixed-width iframe and scaled to fit; and file:// fetches
# fail, so the folder has to actually be served.
#
# Transient animations are hard to catch: the shot fires at a fixed virtual
# time, so a 1.6s celebration is usually over or not yet started. The states
# that need it (strike, save, goal) trigger late on purpose. Expect to nudge
# those numbers rather than to get it first time.
set -e
REPO=$(cd "$(dirname "$0")/.." && pwd)
OUT="$1"
SCALE="${2:-.62}"
STATE="${3:-pick}"
SCROLL="${4:-0}"
SCRUB="${5:-}"
PORT=8811
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"

cd "$REPO"

SHOT_STATE="$STATE" SHOT_SCRUB="$SCRUB" node -e '
const fs=require("fs");
const state=process.env.SHOT_STATE||"pick";
const scrub=parseInt(process.env.SHOT_SCRUB||"",10)||0;
const base=`S=freshState(["Martijn","Bram"],false,"classic",0,"pitch",false); h2TackleOn=false; h2Start();`;
const picked=`${base} h2PickTeam("Netherlands"); h2PickTeam("Italy");`;
const nl=`${picked} S.h2h.tossed=true;`;
const nl2=`${picked} S.h2h.tossed=true;`;
const setups={
  /* the front door and the classic board: not One on One at all, but this is
     the only rendering harness in the repo and a menu that has gone unreadable
     is exactly as invisible in the code as a collapsed pitch was */
  menu:  `S=null; render();`,
  clubs: `S=freshState(["Martijn","Bram"],false,"premier",0,"pitch",false); h2TackleOn=false; h2Start(); render();`,
  clubpitch: `S=freshState(["Martijn","Bram"],false,"premier",0,"pitch",false); h2TackleOn=false; h2Start(); h2PickTeam("Liverpool"); h2PickTeam("Everton"); S.h2h.tossed=true; S.h2h.who=0; S.h2h.at=0; S.phase="h_pick"; render(); h2Select(7);`,
  modes: `S=null; modesOpen=true; setupMode="classic"; render();`,
  setup: `S=null; setupMode="classic"; setupPlay="pitch"; render();`,
  setupb:`S=null; setupMode="classic"; setupPlay="board"; render();`,
  board: `S=freshState(["Martijn","Bram","Ale"],false,"classic",100,"board",false); S.phase="pick"; render();`,
  qcard: `S=freshState(["Martijn","Bram","Ale"],false,"classic",100,"board",false); S.phase="pick"; render(); pickTier("hard");`,
  teams: `${base} render();`,
  hand:  `${nl2} h2TackleOn=true; S.h2h.who=0; S.h2h.at=0; h2Hand(1,"h_mark");`,
  mark:  `${nl2} h2TackleOn=true; S.h2h.who=0; S.h2h.at=0; S.h2h.hand=null; S.phase="h_mark"; render(); h2Mark(5); h2Mark(9);`,
  /* the challenge: marks standing, the ball played into one of them. chal is
     the FROZEN pose the question is asked over; chalgo fires late so the shot
     lands mid-slide, the same trick strike and save use. */
  chal:  `${nl2} h2TackleOn=true; S.h2h.who=0; S.h2h.at=5; S.h2h.marks=[9]; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); h2Select(9); h2Play();`,
  chalgo:`${nl2} h2TackleOn=true; S.h2h.who=0; S.h2h.at=5; S.h2h.marks=[9]; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(9); h2Play(); }, 2500);`,
  chalfar:`${nl2} h2TackleOn=true; S.h2h.who=0; S.h2h.at=0; S.h2h.marks=[9]; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); h2Select(9); h2Play();`,
  foul:  `${nl2} h2TackleOn=true; S.h2h.who=0; S.h2h.at=5; S.h2h.marks=[9]; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); h2Select(9); h2Play(); setTimeout(()=>{ h2TackleReveal(); h2TackleJudge(false); }, 4000);`,
  chalflat:`h2Tilt=false; ${nl2} h2TackleOn=true; S.h2h.who=0; S.h2h.at=5; S.h2h.marks=[9]; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); h2Select(9); h2Play();`,
  cards: `${nl2} h2TackleOn=false; S.h2h.who=0; S.h2h.at=5; S.h2h.cards=[{},{}]; S.h2h.cards[0][1]=1; S.h2h.cards[0][6]=2; S.h2h.off=[[6],[]]; S.phase="h_pick"; render();`,
  toss:  `${picked} render();`,
  flip:  `${picked} render(); h2Call("heads");`,
  landed:`${picked} render(); h2Call("heads"); h2Land();`,
  pick:  `${base} S.h2h.tossed=true; S.h2h.who=0; S.h2h.at=0; S.phase="h_pick"; render();`,
  sel:   `${base} S.h2h.tossed=true; S.h2h.who=0; S.h2h.at=0; S.phase="h_pick"; render(); h2Select(5);`,
  att:   `${base} S.h2h.tossed=true; S.h2h.who=0; S.h2h.at=9; S.phase="h_pick"; render();`,
  flat:  `h2Tilt=false; ${nl} S.h2h.who=0; S.h2h.at=0; S.phase="h_pick"; render();`,
  nl:    `${nl} S.h2h.who=0; S.h2h.at=0; S.phase="h_pick"; render(); h2Select(7);`,
  it:    `${nl} S.h2h.who=1; S.h2h.at=0; S.phase="h_pick"; render(); h2Select(7);`,
  heat:  `${nl} S.h2h.who=0; S.h2h.at=5; S.h2h.safe=3; S.phase="h_pick"; render(); h2Select(6);`,
  /* THE PRESS (three short balls draw a man), which is not the tackle: the
     mark-based one is chal / chalgo / chalfar / chalflat / foul. This state
     was called `tackle` back when the press was, and cost somebody a trip
     looking for a challenge in it. */
  press: `${nl} S.h2h.who=0; S.h2h.at=5; S.h2h.safe=3; S.phase="h_pick"; render(); h2Select(6); h2Play();`,
  inflight:`${nl} S.h2h.who=0; S.h2h.at=0; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(5); h2Play(); h2Reveal(); h2Judge(true); }, 2500);`,
  shot:  `${nl} S.h2h.who=0; S.h2h.at=9; S.phase="h_pick"; render(); h2Shoot(); h2Reveal(); h2Judge(true);`,
  strike:`${nl} S.h2h.who=0; S.h2h.at=9; S.phase="h_pick"; render(); h2Shoot(); h2Reveal(); h2Judge(true); h2SaveReveal(); setTimeout(()=>h2SaveJudge(false), 3700);`,
  save:  `${nl} S.h2h.who=0; S.h2h.at=9; S.phase="h_pick"; render(); h2Shoot(); h2Reveal(); h2Judge(true); h2SaveReveal(); setTimeout(()=>h2SaveJudge(true), 3800);`,
  goal:  `${nl} S.h2h.who=0; S.h2h.at=9; S.phase="h_pick"; render(); setTimeout(()=>{ h2Shoot(); h2Reveal(); h2Judge(true); h2SaveReveal(); h2SaveJudge(false); }, 3500);`,
  /* the runs (1400ms): scrub to 450 for the run out, 840 for the take, 1300 for the trot home */
  run:    `${nl} S.h2h.who=0; S.h2h.at=7; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(9); h2Play(); h2Reveal(); h2Judge(true); }, 2500);`,
  runw:   `${nl} S.h2h.who=0; S.h2h.at=6; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(8); h2Play(); h2Reveal(); h2Judge(true); }, 2500);`,
  /* The Dugout: the question comes from the receivers career, so it fires
     late enough for the league decks to have landed. */
  dugout: `S=freshState(["Martijn","Bram"],false,"classic",0,"manager",false); h2TackleOn=false; h2Start(); h2PickTeam("Italy"); h2PickTeam("Costa Rica"); S.h2h.tossed=true; setTimeout(()=>{ S.h2h.who=0; S.h2h.at=5; S.phase="h_pick"; render(); h2Select(2); h2Play(); }, 2200);`,
  dugmenu:`S=null; setupMode="classic"; setupPlay="manager"; render();`,
  /* the midfield runs: the eight off their ten, the ten off their eight */
  run8:  `${nl} S.h2h.who=0; S.h2h.at=5; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(6); h2Play(); h2Reveal(); h2Judge(true); }, 1200);`,
  run10: `${nl} S.h2h.who=0; S.h2h.at=5; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(7); h2Play(); h2Reveal(); h2Judge(true); }, 1200);`,
  /* he is still up there a beat later, with the ball, rather than back in the shape */
  held:  `${nl} S.h2h.who=0; S.h2h.at=7; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(9); h2Play(); h2Reveal(); h2Judge(true); }, 1200);`,
  /* and drops back into it when he plays it away */
  back:  `${nl} S.h2h.who=0; S.h2h.at=7; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(9); h2Play(); h2Reveal(); h2Judge(true); setTimeout(()=>{ h2Select(7); h2Play(); h2Reveal(); h2Judge(true); }, 1300); }, 1200);`,
  runlost:`${nl} S.h2h.subs=[0,0]; S.h2h.who=0; S.h2h.at=7; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(9); h2Play(); h2Reveal(); h2Judge(false); }, 2500);`,
  /* the bench, the whistle and the shootout */
  sub:   `${nl} S.h2h.who=0; S.h2h.at=5; S.phase="h_pick"; render(); h2Select(7); h2Play(); h2Reveal(); h2Judge(false);`,
  subgk: `${nl} S.h2h.who=0; S.h2h.at=9; S.phase="h_pick"; render(); h2Shoot(); h2Reveal(); h2Judge(true); h2SaveReveal(); h2SaveJudge(false);`,
  ft:    `${nl} S.h2h.who=0; S.h2h.at=5; S.h2h.min=85; S.players[0].score=1; S.phase="h_pick"; render(); h2Select(7); h2Play(); h2Reveal(); h2Judge(true);`,
  pens:  `${nl} S.h2h.who=0; S.h2h.at=5; S.h2h.min=90; S.players[0].score=1; S.players[1].score=1; S.phase="h_pick"; h2Whistle(); h2AfterWhistle(); S.h2h.so.kicks=[[1,0],[1]]; S.h2h.so.n=3; render();`,
  penq:  `${nl} S.h2h.who=0; S.h2h.at=5; S.h2h.min=90; S.players[0].score=1; S.players[1].score=1; S.phase="h_pick"; h2Whistle(); h2AfterWhistle(); h2SoKick();`,
  over:  `${nl} S.h2h.who=0; S.h2h.at=5; S.h2h.min=90; S.players[0].score=1; S.players[1].score=1; S.phase="h_pick"; h2Whistle(); h2AfterWhistle(); h2SoKick(); h2Reveal(); setTimeout(()=>h2Judge(false), 3700);`,
  pensend:`${nl} S.h2h.who=0; S.h2h.at=5; S.h2h.min=90; S.players[0].score=1; S.players[1].score=1; S.phase="h_pick"; h2Whistle(); h2AfterWhistle(); S.h2h.so.kicks=[[1,1,1],[0,0,0]]; S.h2h.so.n=6; h2SoEnd();`,
  mcq:   `S=freshState(["Martijn","Bram"],false,"classic",0,"pitch",true); h2TackleOn=false; h2Start(); S.h2h.teams=["Netherlands","Italy"]; S.h2h.tossed=true; S.h2h.who=0; S.h2h.at=0; S.phase="h_pick"; render(); h2Select(5); h2Play();`,
};
let h=fs.readFileSync("index.html","utf8");
const drive=`
<script>
window.addEventListener("load",()=>{ setTimeout(()=>{ try{ ${setups[state]||setups.pick} }catch(e){ document.body.innerHTML="<pre style=color:red>"+e+"</pre>"; } ${scrub ? `setTimeout(()=>{ document.getAnimations().forEach(a=>{ try{ a.pause(); a.currentTime=${scrub}; }catch(e){} }); }, 2800);` : ""} }, 700); });
<\/script>`;
fs.writeFileSync("_shot_app.html", h.replace("</body>", drive + "</body>"), "utf8");
'

cat > _shot_frame.html <<HTML
<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;background:#0b1f14}
  #wrap{width:390px;height:1000px;transform:scale($SCALE);transform-origin:0 0}
  iframe{width:390px;height:1000px;border:0;display:block;margin-top:-${SCROLL}px}
</style>
<div id="wrap"><iframe src="_shot_app.html"></iframe></div>
HTML

node _tools/serve.js $PORT >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; rm -f "$REPO/_shot_app.html" "$REPO/_shot_frame.html"' EXIT
sleep 1

"$EDGE" --headless=new --disable-gpu --hide-scrollbars \
  --screenshot="$OUT" --virtual-time-budget=5000 \
  "http://localhost:$PORT/_shot_frame.html" >/dev/null 2>&1

echo "wrote $OUT  (state: $STATE, scale: $SCALE, scroll: $SCROLL${SCRUB:+, scrubbed to ${SCRUB}ms})"
