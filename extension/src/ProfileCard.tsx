import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Account, UserProfile } from './account'
import { AVATAR_COLORS, displayName, PROFILE_LEVELS, STUDY_GOALS } from './account'

export type ProfileStats = { streak: number; days: number; chats: number }
type Props = { account: Account; profile: UserProfile; stats: ProfileStats; syncStatus: string; busy: boolean; onProfile: (profile: UserProfile) => void; onSave: () => void; onSignOut: () => void }

export function Avatar({ name, profile, className = '' }: { name: string; profile: UserProfile; className?: string }) {
  return <span className={`avatar avatar--${profile.color ?? 'lime'} ${className}`} aria-hidden="true">{name.trim().slice(0, 1).toUpperCase() || '?'}</span>
}

function daysUntil(date?: string) {
  if (!date) return null
  const target = new Date(`${date}T00:00:00`).getTime()
  if (!Number.isFinite(target)) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((target - today.getTime()) / 86400000)
}

/** The signed-in profile: what you chose to share about yourself, your study numbers, and the account itself. */
export default function ProfileCard({ account, profile, stats, syncStatus, busy, onProfile, onSave, onSignOut }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<UserProfile>(profile)
  const [subject, setSubject] = useState('')
  const name = displayName(account, profile)
  const exam = daysUntil(profile.examDate)
  const set = (patch: Partial<UserProfile>) => setDraft(previous => ({ ...previous, ...patch }))
  function open() { setDraft({ ...profile, name: profile.name ?? account.user.name }); setSubject(''); setEditing(true) }
  function addSubject() {
    const value = subject.trim().slice(0, 30)
    if (!value) return
    const current = draft.subjects ?? []
    if (current.length < 8 && !current.some(item => item.toLowerCase() === value.toLowerCase())) set({ subjects: [...current, value] })
    setSubject('')
  }
  function save(event: FormEvent) {
    event.preventDefault()
    // Empty fields are left out, so the saved profile only holds what you filled in.
    const clean = Object.fromEntries(Object.entries({ ...draft, name: draft.name?.trim(), bio: draft.bio?.trim(), school: draft.school?.trim() })
      .filter(([, value]) => value !== '' && value !== undefined && !(Array.isArray(value) && !value.length))) as UserProfile
    onProfile(clean); setEditing(false)
  }

  if (editing) return <form className="profile-page profile-edit" onSubmit={save} aria-labelledby="profile-edit-title">
    <div className="profile-edit-head">
      <h2 id="profile-edit-title">Edit profile</h2>
      <Avatar name={draft.name || account.user.name} profile={draft} className="avatar--lg" />
    </div>
    <fieldset className="profile-fieldset">
      <legend>Colour</legend>
      <div className="swatches" role="radiogroup" aria-label="Colour">
        {AVATAR_COLORS.map(color => <button key={color} type="button" role="radio" aria-checked={(draft.color ?? 'lime') === color} aria-label={color} className={`swatch avatar--${color}`} onClick={() => set({ color })} />)}
      </div>
    </fieldset>
    <div className="profile-grid">
      <label>Display name<input value={draft.name ?? ''} onChange={e => set({ name: e.target.value })} maxLength={40} required autoComplete="nickname" /></label>
      <label>School <span className="optional">optional</span><input value={draft.school ?? ''} onChange={e => set({ school: e.target.value })} maxLength={60} placeholder="Any school, college or course" /></label>
      <label className="profile-wide">About you<textarea rows={2} value={draft.bio ?? ''} onChange={e => set({ bio: e.target.value })} maxLength={120} placeholder="What are you studying for?" /></label>
      <label>Level <span className="optional">optional</span><select value={draft.level ?? ''} onChange={e => set({ level: e.target.value || undefined })}><option value="">Prefer not to say</option>{PROFILE_LEVELS.map(level => <option key={level}>{level}</option>)}</select></label>
      <label>Next exam <span className="optional">optional</span><input type="date" value={draft.examDate ?? ''} onChange={e => set({ examDate: e.target.value || undefined })} /></label>
    </div>
    <div className="profile-fieldset">
      <span className="profile-label" id="subjects-label">Subjects <span className="optional">each gets its own Recall AI chats</span></span>
      <div className="subject-input">
        <input aria-labelledby="subjects-label" value={subject} onChange={e => setSubject(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSubject() } }} placeholder="Type a subject and press Enter" maxLength={30} disabled={(draft.subjects?.length ?? 0) >= 8} />
        <button type="button" className="secondary" onClick={addSubject} disabled={!subject.trim()}>Add</button>
      </div>
      {!!draft.subjects?.length && <ul className="subject-chips">{draft.subjects.map(item => <li key={item}>{item}<button type="button" aria-label={`Remove ${item}`} onClick={() => set({ subjects: draft.subjects?.filter(other => other !== item) })}>×</button></li>)}</ul>}
    </div>
    <div className="profile-fieldset">
      <span className="profile-label">Daily study goal</span>
      <div className="segmented" role="group" aria-label="Daily study goal">{STUDY_GOALS.map(minutes => <button key={minutes} type="button" aria-pressed={draft.goal === minutes} onClick={() => set({ goal: draft.goal === minutes ? undefined : minutes })}>{minutes} min</button>)}</div>
    </div>
    <div className="button-row profile-actions"><button className="primary">Save profile</button><button type="button" className="secondary" onClick={() => setEditing(false)}>Cancel</button></div>
  </form>

  return <section className="profile-page" aria-labelledby="profile-title">
    <div className="profile-hero">
      <Avatar name={name} profile={profile} className="avatar--xl" />
      <div className="profile-who">
        <h2 id="profile-title">{name}</h2>
        <p>{[profile.level, profile.school].filter(Boolean).join(' · ') || account.user.email}</p>
        {profile.bio && <p className="profile-bio">{profile.bio}</p>}
      </div>
      <button type="button" className="secondary profile-edit-button" onClick={open}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m14 6 4 4" /></svg>Edit profile</button>
    </div>
    <dl className="profile-stats">
      <div><dt>Day streak</dt><dd>{stats.streak}</dd></div>
      <div><dt>Days studied</dt><dd>{stats.days}</dd></div>
      <div><dt>Saved chats</dt><dd>{stats.chats}</dd></div>
      <div><dt>{exam === null ? 'Daily goal' : exam >= 0 ? 'Days to exam' : 'Exam'}</dt><dd>{exam === null ? profile.goal ? <>{profile.goal}<span> min</span></> : '-' : exam >= 0 ? exam : 'Done'}</dd></div>
    </dl>
    {profile.subjects?.length || profile.goal ? <div className="card profile-details">
      {!!profile.subjects?.length && <div><h3>Subjects</h3><ul className="subject-chips subject-chips--static">{profile.subjects.map(item => <li key={item}>{item}</li>)}</ul></div>}
      {!!profile.goal && <div><h3>Daily goal</h3><p>{profile.goal} minutes of focused study a day</p></div>}
    </div> : <button type="button" className="card profile-empty" onClick={open}><strong>Customize your profile</strong><span>Add your colour, school, subjects, a daily goal and your next exam.</span></button>}
    <div className="card profile-account">
      <h3>Account</h3>
      <dl><div><dt>Email</dt><dd>{account.user.email}</dd></div><div><dt>Sync</dt><dd className="profile-sync" role="status">{syncStatus}</dd></div></dl>
      <div className="button-row"><button className="secondary" disabled={busy} onClick={onSave}>{busy ? 'Working...' : 'Save now'}</button><button className="ghost profile-signout" disabled={busy} onClick={onSignOut}>Sign out</button></div>
    </div>
  </section>
}
