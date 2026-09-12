#!/bin/sh
# Screenshot One on One at phone width, in whatever state you name.
#
#   sh _tools/shot-h2h.sh out.png [scale] [state] [scrollpx]
#
#   scrollpx  shift the app up inside the frame, to inspect something that
#             falls below the fold at a high scale
#
#   scale   1.0 to inspect detail, .6 to see a whole phone screen
#   state   menu | modes | board | qcard
#           teams | toss | flip | landed | pick | sel | nl | it | flat
#           att | shot | strike | save | goal | mcq
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
PORT=8811
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"

cd "$REPO"

SHOT_STATE="$STATE" node -e '
const fs=require("fs");
const state=process.env.SHOT_STATE||"pick";
const base=`S=freshState(["Martijn","Bram"],false,"h2h",0); h2Start();`;
const picked=`${base} h2PickTeam("Netherlands"); h2PickTeam("Italy");`;
const nl=`${picked} S.h2h.tossed=true;`;
const setups={
  /* the front door and the classic board: not One on One at all, but this is
     the only rendering harness in the repo and a menu that has gone unreadable
     is exactly as invisible in the code as a collapsed pitch was */
  menu:  `S=null; render();`,
  modes: `S=null; modesOpen=true; setupMode="classic"; render();`,
  board: `S=freshState(["Martijn","Bram","Ale"],false,"classic",100); S.phase="pick"; render();`,
  qcard: `S=freshState(["Martijn","Bram","Ale"],false,"classic",100); S.phase="pick"; render(); pickTier("hard");`,
  teams: `${base} render();`,
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
  tackle:`${nl} S.h2h.who=0; S.h2h.at=5; S.h2h.safe=3; S.phase="h_pick"; render(); h2Select(6); h2Play();`,
  inflight:`${nl} S.h2h.who=0; S.h2h.at=0; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(5); h2Play(); h2Reveal(); h2Judge(true); }, 4450);`,
  shot:  `${nl} S.h2h.who=0; S.h2h.at=9; S.phase="h_pick"; render(); h2Shoot(); h2Reveal(); h2Judge(true);`,
  strike:`${nl} S.h2h.who=0; S.h2h.at=9; S.phase="h_pick"; render(); h2Shoot(); h2Reveal(); h2Judge(true); h2SaveReveal(); setTimeout(()=>h2SaveJudge(false), 3700);`,
  save:  `${nl} S.h2h.who=0; S.h2h.at=9; S.phase="h_pick"; render(); h2Shoot(); h2Reveal(); h2Judge(true); h2SaveReveal(); setTimeout(()=>h2SaveJudge(true), 3800);`,
  goal:  `${nl} S.h2h.who=0; S.h2h.at=9; S.phase="h_pick"; render(); setTimeout(()=>{ h2Shoot(); h2Reveal(); h2Judge(true); h2SaveReveal(); h2SaveJudge(false); }, 3500);`,
  mcq:   `S=freshState(["Martijn","Bram"],false,"h2mc",0); h2Start(); S.h2h.teams=["Netherlands","Italy"]; S.h2h.tossed=true; S.h2h.who=0; S.h2h.at=0; S.phase="h_pick"; render(); h2Select(5); h2Play();`,
};
let h=fs.readFileSync("index.html","utf8");
const drive=`
<script>
window.addEventListener("load",()=>{ setTimeout(()=>{ try{ ${setups[state]||setups.pick} }catch(e){ document.body.innerHTML="<pre style=color:red>"+e+"</pre>"; } }, 700); });
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

echo "wrote $OUT  (state: $STATE, scale: $SCALE, scroll: $SCROLL)"
