/* ═══════════════════════════════════════════════════════════════════════════
   HAGUE APOSTILLE CONVENTION — ELIGIBILITY DATA MODULE
   Ink & Seal Notary Pros — Apostille intake form (services/apostille/index.html)
   ═══════════════════════════════════════════════════════════════════════════

   WHAT THIS FILE IS
   ------------------
   A locally-maintained, offline dataset of which destination countries the
   1961 Hague Apostille Convention currently applies to. It is the single
   source of truth the Apostille intake form uses, in Step 1, to tell a
   customer immediately whether Ink & Seal can process an apostille for the
   country they select.

   AUTHORITATIVE SOURCE
   ---------------------
   Convention of 5 October 1961 Abolishing the Requirement of Legalisation
   for Foreign Public Documents ("the Apostille Convention").
   Official HCCH status table: https://www.hcch.net/en/instruments/status-table?cid=41

   This file is NOT a live scrape of that table — the production environment
   this file was authored in has no outbound network access to hcch.net, so
   it could not be fetched directly. Instead this dataset was compiled from:
     (a) the well-established, publicly documented list of Apostille
         Convention Contracting Parties, and
     (b) a set of targeted, dated web searches (see LAST_VERIFIED below) used
         specifically to confirm recent accessions/entries-into-force that
         are less than a few years old and therefore more likely to be
         missing from general background knowledge (e.g. Canada, mainland
         China, Saudi Arabia, Indonesia, Algeria, Vietnam, Thailand).

   This is explicitly NOT a claim of a complete, row-by-row cross-check
   against every entry on the live HCCH table. See "MAINTENANCE" below for
   how to close that gap.

   WHY OFFLINE, NOT A LIVE HCCH LOOKUP
   ------------------------------------
   Every Apostille form submission calling hcch.net at eligibility-check time
   would make the entire intake form depend on a third-party website's
   uptime. That's an unacceptable single point of failure for a paid intake
   flow. This file is loaded as a static asset instead, so the eligibility
   check works even if hcch.net is slow, down, or blocked.

   DESIGN RULE — WHEN IN DOUBT, DO NOT GUESS "ELIGIBLE"
   -------------------------------------------------------
   COUNTRIES object below is an ALLOW-LIST: every entry present is a country
   we are reasonably confident is (or will become, per its dates) a
   Contracting Party with the Convention applicable. Any country the
   customer selects that is NOT a key in this object is treated as
   "not eligible" by getHagueEligibility() below — it shows the standard
   "different authentication process, contact us" message rather than a
   guess. This is a deliberate bias: a false "not eligible" just costs the
   customer one extra click to Contact Us; a false "eligible" could have
   them pay for and start a process we can't actually complete for their
   destination. Never flip that bias without re-verifying against the live
   HCCH table first.

   HOW ELIGIBILITY IS COMPUTED (handles future entry-into-force dates)
   -----------------------------------------------------------------------
   Some countries have ACCEDED to the Convention, but it does not enter into
   force for them until a specific future date (the Convention gives other
   Contracting Parties a waiting period to object). Rather than hard-coding
   an "eligible: true/false" boolean that would silently go stale, each
   record stores its entryIntoForce date (or null, for long-standing
   members whose exact historical date wasn't confidently available in this
   compilation), and getHagueEligibility() below computes eligibility as
   "entryIntoForce is on or before today" using the browser's local clock —
   no network call required. A country like Vietnam, not yet in force as of
   this file's LAST_VERIFIED date, will automatically become eligible on the
   form the day its entryIntoForce date arrives, with no code change needed.

   MAINTENANCE / HOW TO UPDATE THIS FILE
   ----------------------------------------
   1. Open the live HCCH status table: https://www.hcch.net/en/instruments/status-table?cid=41
   2. For each country you're adding, changing, or double-checking, record:
        - the exact country name (match the spelling used in
          COUNTRY_DROPDOWN_LIST below, so the Step-1 dropdown value and this
          lookup table's key always agree — mismatches silently fall through
          to "not eligible"),
        - its entry-into-force date for that specific country (not the
          Convention's original 1965 date — each Contracting Party has its
          own),
        - whether it's a Contracting Party at all (don't add a country that
          has only signed but never ratified/acceded — signature alone does
          not bind a state).
   3. Add or edit its entry in COUNTRIES below. Use ISO format 'YYYY-MM-DD'
      for entryIntoForce, or null if genuinely unknown/unconfirmed.
   4. Update LAST_VERIFIED to today's date and, if it was a substantive
      correction (not just a routine spot-check), add a one-line note to
      CHANGE_LOG at the bottom of this file.
   5. No redeployment of Apps Script is required — this file is a static
      website asset. Push the change to the site's git repo like any other
      front-end file.
   6. Recommended cadence: re-check this file against the live HCCH table
      at least quarterly, and immediately whenever staff hear of a new
      country's accession (these are periodically in the news).

   WHAT "ELIGIBLE" MEANS HERE (SCOPE / LIMITATIONS)
   ---------------------------------------------------
   - This checks only whether the Convention is *in force* for the selected
     destination country in general. It does not model the (rare) case of a
     specific Contracting Party formally objecting to a specific new
     accession, which under the Convention can mean it is not yet in force
     as between those two specific states even though both otherwise
     appear as Contracting Parties. That edge case is a manual-review
     matter, not something this lookup attempts to resolve.
   - "Country" here means the country/territory a document will be
     PRESENTED IN — i.e. Step 1's "Where will this document be used?"
     question — not the country that issued the document (Ink & Seal only
     issues from U.S./Illinois/Indiana jurisdictions per the existing
     "Where was your document issued?" question elsewhere in Step 1).

   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SOURCE_URL  = 'https://www.hcch.net/en/instruments/status-table?cid=41';
  var SOURCE_NAME = 'HCCH — Status table, Convention of 5 October 1961 Abolishing the Requirement of Legalisation for Foreign Public Documents';
  var LAST_VERIFIED = '2026-08-22';

  // ── Allow-list of Contracting Parties (or countries with a confirmed,
  // dated accession pending entry into force). Keys must exactly match the
  // option text used in COUNTRY_DROPDOWN_LIST below.
  //
  //   entryIntoForce : 'YYYY-MM-DD' for that specific country, or null if
  //                    this compilation could not confidently confirm the
  //                    exact historical date (current Contracting Party
  //                    status is still confirmed in those cases — only the
  //                    precise date is left blank rather than guessed).
  //   note           : optional human-readable context.
  var COUNTRIES = {
    // ── Europe ──────────────────────────────────────────────────────────
    'Albania':                       { entryIntoForce: null,          note: '' },
    'Andorra':                       { entryIntoForce: null,          note: '' },
    'Armenia':                       { entryIntoForce: null,          note: '' },
    'Austria':                       { entryIntoForce: null,          note: '' },
    'Azerbaijan':                    { entryIntoForce: null,          note: '' },
    'Belarus':                       { entryIntoForce: null,          note: '' },
    'Belgium':                       { entryIntoForce: null,          note: '' },
    'Bosnia and Herzegovina':        { entryIntoForce: null,          note: '' },
    'Bulgaria':                      { entryIntoForce: null,          note: '' },
    'Croatia':                       { entryIntoForce: null,          note: '' },
    'Cyprus':                        { entryIntoForce: null,          note: '' },
    'Czech Republic':                { entryIntoForce: null,          note: '' },
    'Denmark':                       { entryIntoForce: null,          note: '' },
    'Estonia':                       { entryIntoForce: null,          note: '' },
    'Finland':                       { entryIntoForce: null,          note: '' },
    'France':                        { entryIntoForce: null,          note: '' },
    'Georgia':                       { entryIntoForce: null,          note: '' },
    'Germany':                       { entryIntoForce: null,          note: '' },
    'Greece':                        { entryIntoForce: null,          note: '' },
    'Hungary':                       { entryIntoForce: null,          note: '' },
    'Iceland':                       { entryIntoForce: null,          note: '' },
    'Ireland':                       { entryIntoForce: null,          note: '' },
    'Italy':                         { entryIntoForce: null,          note: '' },
    'Kazakhstan':                    { entryIntoForce: null,          note: '' },
    'Latvia':                        { entryIntoForce: null,          note: '' },
    'Liechtenstein':                 { entryIntoForce: null,          note: '' },
    'Lithuania':                     { entryIntoForce: null,          note: '' },
    'Luxembourg':                    { entryIntoForce: null,          note: '' },
    'Malta':                         { entryIntoForce: null,          note: '' },
    'Moldova':                       { entryIntoForce: null,          note: '' },
    'Monaco':                        { entryIntoForce: null,          note: '' },
    'Montenegro':                    { entryIntoForce: null,          note: '' },
    'Netherlands':                   { entryIntoForce: null,          note: '' },
    'North Macedonia':               { entryIntoForce: null,          note: '' },
    'Norway':                        { entryIntoForce: null,          note: '' },
    'Poland':                        { entryIntoForce: null,          note: '' },
    'Portugal':                      { entryIntoForce: null,          note: '' },
    'Romania':                       { entryIntoForce: null,          note: '' },
    'Russia':                        { entryIntoForce: null,          note: '' },
    'San Marino':                    { entryIntoForce: null,          note: '' },
    'Serbia':                        { entryIntoForce: null,          note: '' },
    'Slovakia':                      { entryIntoForce: null,          note: '' },
    'Slovenia':                      { entryIntoForce: null,          note: '' },
    'Spain':                         { entryIntoForce: null,          note: '' },
    'Sweden':                        { entryIntoForce: null,          note: '' },
    'Switzerland':                   { entryIntoForce: null,          note: '' },
    'Turkey':                        { entryIntoForce: null,          note: '' },
    'Ukraine':                       { entryIntoForce: null,          note: '' },
    'United Kingdom':                { entryIntoForce: null,          note: '' },
    'Vatican City':                  { entryIntoForce: null,          note: '' },

    // ── Americas ────────────────────────────────────────────────────────
    'Antigua and Barbuda':           { entryIntoForce: null,          note: '' },
    'Argentina':                     { entryIntoForce: null,          note: '' },
    'Bahamas':                       { entryIntoForce: null,          note: '' },
    'Barbados':                      { entryIntoForce: null,          note: '' },
    'Belize':                        { entryIntoForce: null,          note: '' },
    'Brazil':                        { entryIntoForce: null,          note: '' },
    'Canada':                        { entryIntoForce: '2024-01-11',  note: 'Acceded 2023-05-12.' },
    'Chile':                         { entryIntoForce: null,          note: '' },
    'Colombia':                      { entryIntoForce: null,          note: '' },
    'Costa Rica':                    { entryIntoForce: null,          note: '' },
    'Dominica':                      { entryIntoForce: null,          note: '' },
    'Dominican Republic':            { entryIntoForce: null,          note: '' },
    'Ecuador':                       { entryIntoForce: null,          note: '' },
    'El Salvador':                   { entryIntoForce: null,          note: '' },
    'Grenada':                       { entryIntoForce: null,          note: '' },
    'Guatemala':                     { entryIntoForce: null,          note: '' },
    'Guyana':                        { entryIntoForce: null,          note: '' },
    'Honduras':                      { entryIntoForce: null,          note: '' },
    'Jamaica':                       { entryIntoForce: null,          note: '' },
    'Mexico':                        { entryIntoForce: null,          note: '' },
    'Nicaragua':                     { entryIntoForce: null,          note: '' },
    'Panama':                        { entryIntoForce: null,          note: '' },
    'Paraguay':                      { entryIntoForce: null,          note: '' },
    'Peru':                          { entryIntoForce: null,          note: '' },
    'Saint Kitts and Nevis':         { entryIntoForce: null,          note: '' },
    'Saint Lucia':                   { entryIntoForce: null,          note: '' },
    'Saint Vincent and the Grenadines': { entryIntoForce: null,       note: '' },
    'Suriname':                      { entryIntoForce: null,          note: '' },
    'Trinidad and Tobago':           { entryIntoForce: null,          note: '' },
    'Uruguay':                       { entryIntoForce: null,          note: '' },
    'Venezuela':                     { entryIntoForce: null,          note: '' },

    // ── Asia-Pacific ────────────────────────────────────────────────────
    'Australia':                     { entryIntoForce: null,          note: '' },
    'Brunei':                        { entryIntoForce: null,          note: '' },
    'China':                         { entryIntoForce: '2023-11-07',  note: 'Mainland China. Hong Kong SAR and Macao SAR are listed separately below.' },
    'Cook Islands':                  { entryIntoForce: null,          note: '' },
    'Fiji':                          { entryIntoForce: null,          note: '' },
    'Hong Kong SAR':                 { entryIntoForce: null,          note: 'Extension of the Convention to the Hong Kong Special Administrative Region of China.' },
    'India':                         { entryIntoForce: null,          note: '' },
    'Indonesia':                     { entryIntoForce: '2022-06-04',  note: '' },
    'Israel':                        { entryIntoForce: null,          note: '' },
    'Japan':                         { entryIntoForce: null,          note: '' },
    'Kyrgyzstan':                    { entryIntoForce: null,          note: '' },
    'Macao SAR':                     { entryIntoForce: null,          note: 'Extension of the Convention to the Macao Special Administrative Region of China.' },
    'Marshall Islands':              { entryIntoForce: null,          note: '' },
    'Mongolia':                      { entryIntoForce: null,          note: '' },
    'New Zealand':                   { entryIntoForce: null,          note: '' },
    'Niue':                          { entryIntoForce: null,          note: '' },
    'Palau':                         { entryIntoForce: null,          note: '' },
    'Philippines':                   { entryIntoForce: null,          note: '' },
    'Samoa':                         { entryIntoForce: null,          note: '' },
    'Saudi Arabia':                  { entryIntoForce: '2022-12-07',  note: '' },
    'Singapore':                     { entryIntoForce: null,          note: '' },
    'South Korea':                   { entryIntoForce: null,          note: '' },
    'Tajikistan':                    { entryIntoForce: null,          note: '' },
    'Thailand':                      { entryIntoForce: '2027-02-28',  note: 'Acceded 2026-06-30. Not yet in force — becomes eligible on the entry-into-force date above.' },
    'Uzbekistan':                    { entryIntoForce: null,          note: '' },
    'Vanuatu':                       { entryIntoForce: null,          note: '' },
    'Vietnam':                       { entryIntoForce: '2026-09-11',  note: 'Acceded 2025-12-31. Not yet in force — becomes eligible on the entry-into-force date above.' },

    // ── Africa ──────────────────────────────────────────────────────────
    'Algeria':                       { entryIntoForce: '2026-07-09',  note: 'Acceded 2025-11-05.' },
    'Botswana':                      { entryIntoForce: null,          note: '' },
    'Burundi':                       { entryIntoForce: null,          note: '' },
    'Cabo Verde':                    { entryIntoForce: null,          note: '' },
    'Eswatini':                      { entryIntoForce: null,          note: '' },
    'Lesotho':                       { entryIntoForce: null,          note: '' },
    'Liberia':                       { entryIntoForce: null,          note: '' },
    'Malawi':                        { entryIntoForce: null,          note: '' },
    'Mauritius':                     { entryIntoForce: null,          note: '' },
    'Namibia':                       { entryIntoForce: null,          note: '' },
    'Sao Tome and Principe':         { entryIntoForce: null,          note: '' },
    'Seychelles':                    { entryIntoForce: null,          note: '' },
    'South Africa':                  { entryIntoForce: null,          note: '' }
  };

  // ── Full destination list for the Step-1 dropdown. Every value here is
  // shown to the customer as a selectable option, regardless of Hague
  // status — a country NOT in COUNTRIES above will correctly resolve to
  // "not eligible" via getHagueEligibility() rather than being omitted
  // from the list (customers still need to be able to select their real
  // destination and see the accurate result, including "not eligible").
  var COUNTRY_DROPDOWN_LIST = [
    'Afghanistan','Albania','Algeria','Andorra','Angola','Antigua and Barbuda','Argentina','Armenia',
    'Australia','Austria','Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium',
    'Belize','Benin','Bhutan','Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria',
    'Burkina Faso','Burundi','Cabo Verde','Cambodia','Cameroon','Canada','Central African Republic','Chad',
    'Chile','China','Colombia','Comoros','Congo (Republic of the)','Costa Rica','Cook Islands',
    "Côte d'Ivoire",'Croatia','Cuba','Cyprus','Czech Republic','Democratic Republic of the Congo','Denmark',
    'Djibouti','Dominica','Dominican Republic','Ecuador','Egypt','El Salvador','Equatorial Guinea','Eritrea',
    'Estonia','Eswatini','Ethiopia','Fiji','Finland','France','Gabon','Gambia','Georgia','Germany','Ghana',
    'Greece','Grenada','Guatemala','Guinea','Guinea-Bissau','Guyana','Haiti','Honduras','Hong Kong SAR',
    'Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Jamaica','Japan',
    'Jordan','Kazakhstan','Kenya','Kiribati','Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Lesotho',
    'Liberia','Libya','Liechtenstein','Lithuania','Luxembourg','Macao SAR','Madagascar','Malawi','Malaysia',
    'Maldives','Mali','Malta','Marshall Islands','Mauritania','Mauritius','Mexico','Micronesia','Moldova',
    'Monaco','Mongolia','Montenegro','Morocco','Mozambique','Myanmar','Namibia','Nauru','Nepal',
    'Netherlands','New Zealand','Nicaragua','Niger','Nigeria','Niue','North Korea','North Macedonia',
    'Norway','Oman','Pakistan','Palau','Palestine','Panama','Papua New Guinea','Paraguay','Peru',
    'Philippines','Poland','Portugal','Qatar','Romania','Russia','Rwanda','Saint Kitts and Nevis',
    'Saint Lucia','Saint Vincent and the Grenadines','Samoa','San Marino','Sao Tome and Principe',
    'Saudi Arabia','Senegal','Serbia','Seychelles','Sierra Leone','Singapore','Slovakia','Slovenia',
    'Solomon Islands','Somalia','South Africa','South Korea','South Sudan','Spain','Sri Lanka','Sudan',
    'Suriname','Sweden','Switzerland','Syria','Taiwan','Tajikistan','Tanzania','Thailand','Timor-Leste',
    'Togo','Tonga','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Tuvalu','Uganda','Ukraine',
    'United Arab Emirates','United Kingdom','Uruguay','Uzbekistan','Vanuatu','Vatican City','Venezuela',
    'Vietnam','Yemen','Zambia','Zimbabwe'
  ];

  function todayIso() {
    // Uses the browser's local date. This is a display/routing check, not
    // a legal determination, so local-vs-UTC drift of a few hours around
    // midnight on an entry-into-force date is an acceptable tradeoff for
    // staying fully offline.
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  // Returns:
  //   {
  //     eligible: boolean,        -- true only if a matched, dated-or-undated
  //                                   Contracting Party whose entry-into-force
  //                                   (if any) is on or before today
  //     matched:  boolean,        -- true if the country was found in COUNTRIES
  //     entryIntoForce: string|null,
  //     note: string,
  //     source: string,
  //     lastVerified: string
  //   }
  function getHagueEligibility(countryName) {
    var rec = COUNTRIES[countryName];
    if (!rec) {
      return {
        eligible: false, matched: false, entryIntoForce: null,
        note: 'Not found in the locally-maintained Hague eligibility dataset.',
        source: SOURCE_URL, lastVerified: LAST_VERIFIED
      };
    }
    var eligible = !rec.entryIntoForce || rec.entryIntoForce <= todayIso();
    return {
      eligible: eligible, matched: true, entryIntoForce: rec.entryIntoForce || null,
      note: rec.note || '', source: SOURCE_URL, lastVerified: LAST_VERIFIED
    };
  }

  global.HAGUE_APOSTILLE_DATA = {
    sourceUrl: SOURCE_URL,
    sourceName: SOURCE_NAME,
    lastVerified: LAST_VERIFIED,
    countries: COUNTRIES
  };
  global.HAGUE_COUNTRY_DROPDOWN_LIST = COUNTRY_DROPDOWN_LIST;
  global.getHagueEligibility = getHagueEligibility;

})(window);

/* ═══════════════════════════════════════════════════════════════════════════
   CHANGE LOG
   -----------
   2026-08-22 — Initial dataset compiled (see header for methodology/limits).
   ═══════════════════════════════════════════════════════════════════════════ */
