#!/bin/sh
# Screenshot the difficulty picker at phone width.
#
#   sh shot.sh out.png [scale] [scrollpx]
#
# Two things this repo has learned the hard way, both worked around here:
# headless Edge ignores --window-size (it always renders about 492x485), so the
# app is loaded inside a fixed-width iframe and scaled to fit; and file://
# fetches fail, so the banks never load unless the folder is actually served.
set -e
REPO="/c/dev/_Personal/Hobbies/Football Quiz"
OUT="$1"
SCALE="${2:-.55}"   # .55 fits a whole phone screen; 1 to inspect detail
SCROLL="${3:-0}"    # scroll the app itself, to see the lower half at 1:1
PORT=8731

cd "$REPO"

SHOT_SCROLL="$SCROLL" node -e '
const fs=require("fs");
let h=fs.readFileSync("index.html","utf8");
const drive=`
<script>
window.addEventListener("load",()=>{ setTimeout(()=>{
  S = freshState(["Player 1","Player 2"], true, "classic", 100);
  save(); render();
  /* the app scrolls its own column, not the window, so ask the element */
  setTimeout(()=>{ if(${process.env.SHOT_SCROLL||0}){
    const b=document.querySelector(".lane.ball");
    if(b) b.scrollIntoView({block:"end"});
  } }, 250);
}, 900); });
<\/script>`;
fs.writeFileSync("_shot_app.html", h.replace("</body>", drive + "</body>"), "utf8");
'

cat > _shot_frame.html <<HTML
<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;background:#0b1f14}
  #wrap{width:390px;height:880px;transform:scale($SCALE);transform-origin:0 0}
  iframe{width:390px;height:880px;border:0;display:block}
</style>
<div id="wrap"><iframe src="_shot_app.html"></iframe></div>
HTML

py -3 -m http.server $PORT >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; rm -f "$REPO/_shot_app.html" "$REPO/_shot_frame.html"' EXIT
sleep 2

"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --headless=new --disable-gpu --hide-scrollbars \
  --screenshot="$OUT" --virtual-time-budget=6000 \
  "http://localhost:$PORT/_shot_frame.html" >/dev/null 2>&1

echo "wrote $OUT"
