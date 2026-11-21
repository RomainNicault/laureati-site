#!/bin/bash
# Lancé depuis un dossier de travail temporaire contenant prompts.tsv.
while IFS=$'\t' read -r name size subject; do
  [ -f "$name.png" ] && continue
  extra=""
  case "$name" in hero-*) extra="LAYOUT: horizontal composition; keep the upper 40% of the canvas calm and nearly empty paper so a headline and a search field can sit there; main details in the lower part.";; esac
  neg='CONSTRAINTS: no text, no letters, no numbers, no logos, no watermark, no signature.'
  [ "$name" = logo-2-monogramme ] && neg='CONSTRAINTS: the only character is the single capital L; no other text, no numbers, no watermark, no signature.'
  prompt="SUBJECT: $subject $extra STYLE: fine copperplate engraving and etching, like the illustration of a classic French wine label. Two-tone ink only: deep bordeaux (#5B1428) and antique gold (#8A6D2F), printed on warm off-white paper (#F7F3EE). Precise line work and cross-hatching, elegant, warm and calm. Flat paper background, no gradients, no photorealism, no 3D, no drop shadows, no bottles, no frame around the canvas. $neg"
  echo "== $name $(date +%T)"
  chatgpt-imagegen "$prompt" -o "$name.png" --backend codex --size "$size" --quiet --no-progress 2> "$name.err" && echo "ok $name" || { echo "FAIL $name: $(tail -c 300 $name.err)"; grep -qiE '429|usage limit' "$name.err" && exit 3; }
done < prompts.tsv
echo DONE
