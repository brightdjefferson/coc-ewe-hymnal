import { Link } from 'react-router'
import { CONTACT_EMAIL, PRIVACY_UPDATED } from '../lib/site'

export default function PrivacyPage() {
  return (
    <main className="page-pad prose">
      <h1 className="page-h">Privacy</h1>
      <p className="muted small">Last updated {PRIVACY_UPDATED}</p>

      <p>
        The COC Ewe Hymnal is free. It has no adverts, no accounts for readers and no tracking. Here is everything it
        keeps, and where.
      </p>

      <h2>On your phone only</h2>
      <p>
        These stay on your phone or computer and are never sent to us: your favourites, recently opened hymns, services
        you plan, sermon notes, text size, theme and language. The hymns themselves are saved on your phone so they work
        without internet.
      </p>
      <p>
        If you use <strong>Back up</strong> on the More page, the backup file goes wherever you choose to save it.
        Deleting the app or clearing your browser’s data removes everything above.
      </p>

      <h2>Daily reminder (only if you turn it on)</h2>
      <p>
        To send the Hymn of the Day reminder, we keep: a notification address created by your browser (it does not
        contain your name or phone number), the time you chose, your time zone and your reading language. Your browser’s
        maker (Google, Apple, Mozilla or Microsoft) delivers the notification. Turning the reminder off deletes these
        details straight away.
      </p>

      <h2>Admins</h2>
      <p>
        People who add and edit hymns sign in with an email address. For each change we keep who made it and when, so
        mistakes can be undone.
      </p>

      <h2>Services we use</h2>
      <p>
        The app is hosted by Vercel and the hymns are stored with Supabase. Like any website, their servers may briefly
        record technical details of each visit (such as the internet address) to keep the service running and secure. We
        do not use these to identify you, and there are no analytics, cookies for tracking, or adverts. Fonts are part of
        the app, so no font service sees your visit.
      </p>

      <h2>Questions</h2>
      <p>
        {CONTACT_EMAIL ? (
          <>
            Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </>
        ) : (
          <>Please ask the church that shared the hymnal with you.</>
        )}
      </p>

      <p>
        <Link to="/more">← Back to More</Link>
      </p>
    </main>
  )
}
