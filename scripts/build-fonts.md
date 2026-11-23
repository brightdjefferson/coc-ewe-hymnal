# How the bundled fonts were made

The off-the-shelf web font packages split Noto into regional pieces and leave
out the combining circumflex (U+0302) and caron (U+030C) used for Ewe falling
and rising tones. So the app ships its own cut of the full fonts.

Source: full Noto Sans and Noto Serif TTF files (Regular and Bold), SIL OFL 1.1.

Command used for each file (requires `pip install fonttools brotli`):

```sh
pyftsubset NotoSerif-Regular.ttf \
  --unicodes="U+0000-024F,U+0250-02FF,U+0300-036F,U+1E00-1EFF,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+25CC,U+FEFF,U+FFFD" \
  --layout-features='*' --flavor=woff2 \
  --output-file=public/fonts/noto-serif-ewe-400.woff2
```

Covered: Basic Latin, Latin-1, Latin Extended A/B, IPA Extensions (ɖ ɛ ɔ ʋ ɣ),
all combining marks (U+0300–036F), Latin Extended Additional, common punctuation.
