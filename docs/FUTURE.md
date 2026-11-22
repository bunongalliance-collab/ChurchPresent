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

**Who may publish: decided, first step done.** Tied, not open. While there is one church and one account, `supabase/service-publishers.sql` adds a `service_publishers` list: only listed accounts can publish, and the app only shows services from them. To add a team member, add one row (the SQL is at the bottom of that file). When a second church joins, extend this list with a church column (it becomes `church_publishers`) instead of starting again.

## More than one service at the same church

If a church holds several services on one day (for example Bunong and English), publish one order per service name and show a service picker in the app, remembered on the device. Also remember "Hide" on the card until a new week is published. Today the table allows one service per person per date.

## Scripture text for typed references

Today's service opens a passage only when it was chosen from the saved scripture studies. A reference typed by hand (for example "Psalm 23") shows only its title. Possible fix: when publishing, fetch the verses from YouVersion (the Scripture page's Bible connection), reading references in English and Bunong book names. Check each Bible version's terms first: showing verses in the app is usually allowed, but storing them in the database and serving them publicly may not be.

## Choosing how to record services: Recorder or OBS

**Background.** Two ways to record with the Program Order lower third are built: the Recorder page (`#recorder`, in the browser) and the lower-third overlay for OBS (`#lowerthird:<pairing code>`, a Browser Source over the camera). Camera: Sony FDR-AX700 (HDMI Resolution set to 1080p, on-screen icons off). Capture card: Elgato HD60 S, which may not show up in Chrome on a Mac (the HD60 S+ would).

**What decides it, most important first.**
1. Reliability: records the whole service without stopping or losing the file.
2. Ease for the volunteer: fewest steps.
3. Sound: clear speech from the sound desk matters more than bitrate.
4. Picture: true 1080p from the camera, steady frame rate.
5. Extra needs: live streaming, mixing two sound sources, more cameras.

**Plan.**
1. Plug the HD60 S into a USB 3 port and check whether Chrome's Recorder lists it under Camera. If it does not, use OBS.
2. If it does, record 20–30 minutes of a rehearsal with the presentation running. Check: "Camera sends" reads 1920×1080 with no warnings; the file plays to the end and can jump to the middle; the sound is clear and still in sync at the end; the lower third changed at every item.
3. Record the same in OBS (HD60 S source, `#lowerthird` Browser Source on top) and compare both files where people will watch them (YouTube, a TV).
4. Pick the simplest one that passes everything: the Recorder if it does and only recordings are needed; OBS if the Recorder falls short, or for live streaming or sound meters.
5. Either way, also record 4K on the AX700's SD card as a backup.

**Expected outcome.** OBS with the overlay page, mainly because the HD60 S may not appear in the browser on a Mac. OBS also adds live streaming and sound meters, and the lower third stays automatic.

## Other ideas from the app review

- Phone remote for the presenter (Supabase Realtime, paired with a QR code). Needs internet.
- Song history: when each song was last sung and how often; warn about songs sung recently.
- Trash bin: deleted songs, presentations and programs kept for 30 days.
- Backup and export of all songs, readings and programs.
- Side-by-side Bunong and English on slides.
- Navbar grouping and merging the overlapping pages (Program and Program Builder; Service Slides and Presentation Builder). On hold by request.
