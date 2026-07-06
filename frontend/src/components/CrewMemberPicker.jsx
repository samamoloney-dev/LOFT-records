// Lets an admin tie a new check to a real Crew roster member instead of
// just free-typing a name - this is what makes the check's completion date
// automatically count toward that person's currency (see crew.js
// withCurrency, which reads checks by crew_member_id) and lets Continuous
// Improvement analytics group by their fleet/rank. Only rendered when the
// page isn't already scoped to one crew member (see crewMemberId prop on
// EpChecks/CaChecks/ProficiencyChecks) - staying "not linked" keeps today's
// free-text behaviour for ad-hoc/initial-training candidates not yet on
// the roster. Takes the roster as a prop (fetched once by the parent) so
// the parent can also use it to auto-match a typed candidate name against
// an existing crew member - see EpChecks/CaChecks/ProficiencyChecks
// createCheck.
export function CrewMemberPicker({ members, value, onSelect }) {
  return (
    <div className="field">
      <label>Crew member (optional - links this check to their currency record)</label>
      <select value={value || ''} onChange={(e) => onSelect(members.find((m) => m.id === e.target.value) || null)}>
        <option value="">— Not linked (one-off / initial training) —</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </div>
  );
}
