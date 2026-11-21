# Future notes

Ideas discussed but not built yet. Each one says why it matters and what it needs.

## Today's service for more than one church

**Problem.** The Nau Mpro App shows the next published service from anyone. If church A and church B both publish from the Program page, members of church A could see church B's order.

**Plan.**
1. **Each published service carries its church.** Publishing saves the church name from the Program, with a short code made from it (for example `montagnard-bunong-alliance`).
2. **A link for each church.** After publishing, the Program page shows the church's link, for example `/nau-mpro/?church=montagnard-bunong-alliance`, and a QR code. Opening it shows only that church's Today's service, and the app remembers the church on the device, including the installed app.
3. **The plain link asks once.** If more than one church has published, the app asks "Which church do you attend?", remembers the answer, and shows a small Change link on the card. With only one church, it does not ask.
4. **The hymn book stays shared.** Only Today's service is separate for each church.

**Needs.**
- A migration adding a church column (and the short code) to `published_services`, with the unique key changed to church + date.
- Changes to the Program's Publish button and the reader's Today's service card.
- Services published before the change have no church and must be published again.

**Decision still open: who may publish for a church.**
- Open: anyone signed in can publish under any church name. Simple, but someone could publish under another church's name.
- Tied (recommended, since the app is public): a `church_publishers` table links each church to the team members allowed to publish for it, and the database rules check it.

## More than one service at the same church

If a church holds several services on one day (for example Bunong and English), publish one order per service name and show a service picker in the app, remembered on the device. Also remember "Hide" on the card until a new week is published. Today the table allows one service per person per date.

## Scripture text for typed references

Today's service opens a passage only when it was chosen from the saved scripture studies. A reference typed by hand (for example "Psalm 23") shows only its title. Possible fix: when publishing, fetch the verses from YouVersion (the Scripture page's Bible connection), reading references in English and Bunong book names. Check each Bible version's terms first: showing verses in the app is usually allowed, but storing them in the database and serving them publicly may not be.

## Other ideas from the app review

- Phone remote for the presenter (Supabase Realtime, paired with a QR code). Needs internet.
- Song history: when each song was last sung and how often; warn about songs sung recently.
- Trash bin: deleted songs, presentations and programs kept for 30 days.
- Backup and export of all songs, readings and programs.
- Side-by-side Bunong and English on slides.
- Navbar grouping and merging the overlapping pages (Program and Program Builder; Service Slides and Presentation Builder). On hold by request.
