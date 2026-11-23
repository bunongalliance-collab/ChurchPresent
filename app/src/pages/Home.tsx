import { useEffect } from "react";

// Church Tools home page (the main address, "/"): the apps that are available, each with a small picture of itself,
// who it is for and one Open button. Design approved from bible-pwa/sample/home.html.
// Nau Mpro and Nau Brah Ndu Ngơi are for everyone (no account); Church Tools is the team app (Lyric and the rest).

const LYRIC = "#lyrics-v2";

export default function Home() {
  useEffect(() => {
    const before = document.title;
    document.title = "Church Tools · Montagnard Bunong Alliance Church";
    return () => { document.title = before; };
  }, []);

  return (
    <div className="hm">
      <header className="hm-top">
        <a className="hm-brand" href="#" aria-label="Church Tools home"><span className="hm-mark" aria-hidden="true">✝</span>Church Tools</a>
        <a className="hm-signin" href="#team">Team sign in</a>
      </header>

      <main>
        <section className="hm-hero" aria-labelledby="hm-h">
          <p className="hm-eyebrow">Montagnard Bunong Alliance Church</p>
          <h1 id="hm-h">Worship together, in our own language</h1>
          <p className="hm-lede">The hymn book, the Bunong Bible and the tools our team uses to prepare Sunday. Free to use on any phone or computer, and they work without internet once saved.</p>
        </section>

        <section aria-labelledby="hm-g1">
          <div className="hm-group"><h2 id="hm-g1">For everyone</h2><span>No account needed</span></div>
          <div className="hm-apps">
            <a className="hm-app" href="/nau-mpro/">
              <div className="hm-thumb hm-t-nm" aria-hidden="true">
                <div className="hm-phone">
                  <div className="hm-phone-bar">Nau Mpro</div>
                  <div className="hm-phone-card"><b>Today’s service</b>Sunday</div>
                  <div className="hm-phone-row"><i>1</i>Mât ton nau Brah Amoh Yê-su</div>
                  <div className="hm-phone-row"><i>2</i>Gâp tâm rnê Păng</div>
                  <div className="hm-phone-row"><i>3</i>Tâm rnê Yê-su</div>
                </div>
              </div>
              <div className="hm-body">
                <span className="hm-who">Hymn book</span>
                <h3>Nau Mpro</h3>
                <p>All 520 Bunong hymns with words and music sheets, and this Sunday’s order of service.</p>
                <div className="hm-foot"><span className="hm-open">Open Nau Mpro <span aria-hidden="true">→</span></span><span className="hm-note">Add it to your home screen</span></div>
              </div>
            </a>

            <a className="hm-app" href="/nau-brah-ndu-ngoi/">
              <div className="hm-thumb hm-t-bible" aria-hidden="true">
                <div className="hm-page">
                  <div className="hm-page-t">NAU BRAH NDU NGƠI</div>
                  <div className="hm-page-ref">NAU NGLUH · CHAPTER 3</div>
                  <p><sup>1</sup> Y-Môis chiă biăp po păng Y-Jêtrô, Kôranh ƀư brah Midian…</p>
                  <p><mark><sup>2</sup> Tơ lah Yêhôva saơ păng veh ŭch uănh…</mark></p>
                  <p><sup>3</sup> Y-Môis lah: “Gâp mra teng veh uănh…”</p>
                </div>
              </div>
              <div className="hm-body">
                <span className="hm-who">Bible</span>
                <h3>Nau Brah Ndu Ngơi</h3>
                <p>The Bunong Bible (Vietnam dialect). Save verses, highlight, write notes and read offline.</p>
                <div className="hm-foot"><span className="hm-open">Open the Bible <span aria-hidden="true">→</span></span><span className="hm-note">Works offline</span></div>
              </div>
            </a>
          </div>
        </section>

        <section aria-labelledby="hm-g2">
          <div className="hm-group"><h2 id="hm-g2">For the church team</h2><span>Sign in to save and share your work</span></div>
          <div className="hm-apps">
            <a className="hm-app hm-wide" href={LYRIC}>
              <div className="hm-thumb hm-t-tools" aria-hidden="true">
                <div className="hm-screen">
                  <div className="hm-screen-nav"><span className="on">Lyric</span><span>Readings</span><span>Scripture</span><span>Program</span><span>Presentations</span></div>
                  <div className="hm-screen-list"><div>1. Mât ton nau…</div><div className="on">2. Gâp tâm rnê Păng</div><div>3. Tâm rnê Yê-su</div><div>4. Hăn hom he</div></div>
                  <div><div className="hm-slide">Gâp tâm rnê Păng, gâp tâm rnê Păng, mât ton ma Biăp Ueh Brah Ndu<small>C</small></div><div className="hm-mini"><span /><span /><span /></div></div>
                </div>
              </div>
              <div className="hm-body">
                <span className="hm-who">Church team</span>
                <h3>Church Tools</h3>
                <p>Make song and Scripture slides, build Sunday’s program and brochure, present on the projector, and publish the service to Nau Mpro.</p>
                <div className="hm-foot"><span className="hm-open">Open Church Tools <span aria-hidden="true">→</span></span><span className="hm-note">Anyone can view; the team signs in to edit</span></div>
              </div>
            </a>
          </div>
        </section>
      </main>

      <footer className="hm-more">
        <span>Montagnard Bunong Alliance Church · 4116 Freedom Dr. · Charlotte, NC</span>
        <span>Another church? Church Tools works for your team too. <a href="#team">Start a church</a></span>
      </footer>
    </div>
  );
}
