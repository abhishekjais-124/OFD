# Hinglish news in the daily routine

The routine **Daily WhatsApp morning briefing** (`trig_01E7UKfY4deYS2R5tQR7WKkp`, 03:30 UTC = 9:00 AM IST)
now writes its news step in very short, simple Hinglish. Only STEP 3 of its prompt changed on 2026-10-19.

## What the PDF writer must do

OFD shows each story's headline and one summary line exactly as the PDF prints them. For Hinglish to
reach the News page, whatever builds the PDF (the HTML to PDF step that uploads to the Drive folder) must
use the same rules for every headline card:

- Hinglish headline, at most 8 words.
- One Hinglish summary line, at most 14 words.
- Keep the card layout the parser reads: title, summary, `Mon, 19 Oct 2026 07:46:54 UTC · BBC News`, the article URL.
- If a source could not be fetched, say so in one short Hinglish line.

The stored routine prompt does not mention a PDF, images, RSS feeds or Drive, and no run of it exists
around the time today's PDF was written, so the PDF is built somewhere else. Paste the block below into that
generator's news step.

## Calendar interviews

STEP 2 of the routine now finds interviews (events mentioning interview, hiring loop, panel round or candidate, or
organised by Greenhouse, Lever, Ashby or Workable) and prints the calendar part in one labelled line:

```
Meetings: <list or none>. Interviews: <list or none>. On call: <time range or none>. RSVP needed: <list or none>.
```

OFD reads that line (`shared/calendar.ts`) and shows an Interviews row on the calendar card. Until the PDF generator
prints an `Interviews:` label the row says "Not in this briefing" instead of claiming there are none.

## Block to paste

```
Write every story in Hinglish: Hindi written in Roman (English) letters, mixed with common English words
the way people talk on WhatsApp. For each story give (1) a HEADLINE of at most 8 words and (2) one SUMMARY
line of at most 14 words.
Hinglish rules: keep names of people, places, parties, companies, numbers, dates and units exactly as in
the source (write '1.6 million', do not convert). Never change facts, add opinions, guess, or exaggerate.
Prefer words everyone knows: keep common English words (election, sanctions, minister, police, court,
budget, flood, army) instead of hard Hindi, and use simple Hindi verbs (hai, hua, kiya, karega, mili, gira,
badha, chalu). No Devanagari script, no emoji, no slang, no jokes. For deaths, injuries, crime or violence
use a calm, respectful tone (for example '4 logon ki maut'). Keep the outlet name in English. If a source
could not be fetched, say so in one short Hinglish line (for example 'Reuters aur AP load nahi hue').
Examples:
- Alberta mein voting, Canada se alag hone par vote? | Log tay karenge ki separation par vote karwana hai ya nahi.
- WFP Gaza mein madad kam karega | Funds ki kami se 1.6 million ki jagah 1.1 million logon ko madad milegi.
- Tiger Shroff ki car par firing, wo bach gaye | Mumbai mein dheemi chalti car par goliyan chalayi gayi.
```

## Previous STEP 3 (to restore)

```
STEP 3 - News, in SIMPLE ENGLISH. Use WebFetch on live front pages and read the top stories: global:
https://www.bbc.com/news/world , https://apnews.com/ , https://www.reuters.com/world/ (use whichever load);
India: https://www.thehindu.com/news/national/ , https://indianexpress.com/section/india/ ,
https://www.ndtv.com/india (use whichever load). Pick today's single most important global story x2 (two
different stories) and the single most important India story x1. Only use a story whose page shows today's
or yesterday's date; if nothing recent can be fetched, fall back to WebSearch with the exact site name plus
the date. Rewrite each one in very simple English: one short sentence (about 12 words max), everyday words,
no jargon. Put the outlet in brackets. No links.
```
