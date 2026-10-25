# Audience Atlas

**Find the communities your conference should reach—and show exactly why.**

A hackathon app for conference organizers: supply an event and community sources, inspect the graph paths connecting their interests to your talks, and write an invitation with something relevant to say.

## Run locally

Requires Node.js 22.21 or newer. Install the official FalkorDB client for direct local database connections.

```powershell
npm install
npm run dev
```

Open http://localhost:4173. The default campaign is **illustrative sample data**, clearly labeled. Speakers, source excerpts, sharing rules and the event are fictional; community URLs illustrate possible inputs. Do not use the sample quotes as claims about those communities.

For your own campaign, open **Conference & sources**, enter one talk per line (`Title | Speaker | Description`), add public community URLs and excerpts, then select **Find my audience**. Export results and drafts to retain a copy. Campaign data stays in browser local storage; clearing browser storage removes it.

## Sponsor integrations

Copy `.env.example` to `.env.local`, fill the relevant fields privately, and restart the server. `.env.local` is ignored by Git. Hosted runtime values belong in the host's secret settings. Never put secrets in the frontend, screenshots, exported campaign or repository.

### FalkorDB — meaningful graph queries

Configure `FALKORDB_BROWSER_URL` (the HTTP Browser API), with `FALKORDB_TOKEN` or `FALKORDB_HOST`, `FALKORDB_PORT`, `FALKORDB_USER`, `FALKORDB_PASSWORD`, `FALKORDB_TLS`. A `falkors://` connection string is a database connection, not an HTTP Browser URL. The supplied adapter authenticates to the Browser REST API and issues Cypher queries. Use a Browser instance reachable by the app's server. Cloud database credentials alone do not establish that its Browser REST API is reachable.

**Direct local option:** configure `FALKORDB_HOST`, `FALKORDB_PORT`, `FALKORDB_USER`, `FALKORDB_PASSWORD`, and `FALKORDB_TLS` for the actual endpoint. The Node server uses the official `falkordb` client. FalkorDB Cloud Free does not provide TLS; TLS-enabled plans need `true`, while an existing Free endpoint needs `false`. Never disable TLS certificate validation to work around a mismatch. The hosted Worker uses the HTTPS Browser API instead of the Node TCP adapter. HTTPS encrypts app-to-Browser requests; it does not add TLS to the Free instance's underlying database transport. See [official plan capabilities](https://www.falkordb.com/plans/).

**Live verification:** the configured Cloud Free instance was successfully accessed through the HTTPS Browser API. A sample campaign was written to FalkorDB and its actual multi-hop query returned eight evidence paths across four relevant communities, excluding the unrelated design sample. Sample source content remains illustrative. Bright Data, OpenAI and TrueForge still require separate live verification.

Enable **Run matching in FalkorDB**. Each analysis creates a new campaign graph, writes evidence on relationships, then gets match rows from the database. Matches in this mode are derived from returned rows, not the local traversal. Empty or failed database responses are not silently replaced with fake successes. Graphs remain for inspection; the app never deletes them automatically.

```cypher
MATCH (e:Event)-[:HAS_TALK]->(t:Talk)-[tc:COVERS]->(k:Topic)
      <-[cd:DISCUSSES]-(c:Community)
WHERE e.id = $eventId
RETURN c.id AS communityId, t.id AS talkId, k.name AS topic,
       cd.evidence AS communityEvidence, tc.evidence AS talkEvidence
```

The diagram includes speakers through `Speaker → PRESENTS → Talk`. Recommendations expose source URLs, exact evidence excerpts and the talk/topic/community path. Topic counts describe graph overlap; they are not audience size or conversion predictions.

Without configuration, **local graph traversal** is explicitly labeled. It demonstrates the application flow but is **not** a verified FalkorDB integration for judging.

### Bright Data — public page collection

Set `BRIGHTDATA_API_KEY` and `BRIGHTDATA_UNLOCKER_ZONE` for a Web Unlocker zone. Enable live fetching to send community URLs to Bright Data's `POST https://api.brightdata.com/request`, requesting markdown. The organizer's structured talk agenda remains intact rather than being replaced by an unstructured event page. Missing credentials stop live collection immediately. A failed fetch uses pasted text only when at least 20 characters exist and produces a warning. Without usable fallback text, analysis stops after all fetches settle. Every source records its actual collection mode; successful sources get timestamps. Campaign summaries report successful/failed counts, and zero successful fetches are labeled as pasted text, not Bright Data. Access is limited to public content; Facebook pages behind login may require pasted authorized excerpts. Video scripts use accessible textual context; this version does not transcribe arbitrary videos or generate video media.

### OpenAI — extraction and writing

Set `OPENAI_API_KEY`, optionally `OPENAI_MODEL` (defaults to `gpt-4.1-mini`). Enable AI extraction to classify source text into a small canonical topic vocabulary. Exact supporting quotes are checked against the original supplied text before they enter the graph. The writer calls the Responses API and returns an editable draft. Requests use `store: false`.

Without OpenAI, explicit keyword matching and templates work, labeled as such. The limited vocabulary can miss topics; it does not infer community-wide opinions or verify speaker claims.

### TrueForge + OpenAI — agent writer

Run the official TrueForge runtime (`npx @truefoundry/trueforge`), configure an OpenAI model in its Settings, and set `TRUEFORGE_BASE_URL`, `TRUEFORGE_MODEL` and optional `TRUEFORGE_TOKEN`. In Outreach studio choose **TrueForge + OpenAI**. The app creates a persistent agent session using the TrueForge HTTP API, passes graph evidence, streams a turn and retains its session ID with the draft. The agent is a draft-only writer, not an auto-publisher. A manual review checkbox in our UI is **not** a TrueForge tool approval; do not claim native sandbox/approval/MCP usage unless you actually add and demonstrate it.

### Qodo

The owner authorized a project-specific exception allowing pull requests for Audience Atlas. The Bright Data source-provenance fix is prepared as a real PR for Qodo review. Qodo's GitHub App must be installed on this repository before it can run. Do not claim completed Qodo usage until a real review is present and its findings have been addressed. No review findings or PR links are fabricated.

## Validation and build

```powershell
npm test
npm run build
npm run validate
```

`scripts/build.mjs` bundles the dependency-free source and frontend into `worker/index.js` and `dist/server/index.js`. The Worker uses HTTP-based integrations and can run on Sites. `scripts/dev.mjs` adapts the same Worker handler to Node HTTP locally. `.openai/hosting.json` identifies the registered Site. Sites starts private; judges need appropriate access or a local demonstration/video.

## Scope and limits

One event, up to 12 talk lines and 10 communities per analysis. No social posting, account login for private groups, audience reach estimates, ticket-sales attribution, job screening or actual video rendering. Source data may be incomplete, stale or unrepresentative. Check live service runs before claiming track eligibility. Data is sent to configured providers only when the corresponding option is selected. Generated drafts always require organizer review before sharing elsewhere.

## References

- [FalkorDB Browser REST API](https://falkordb.github.io/docs-staging/integration/rest/)
- [Bright Data Web Unlocker](https://docs.brightdata.com/api-reference/rest-api/unlocker/unlock-website)
- [TrueForge agent API](https://github.com/truefoundry/trueforge/blob/main/docs/api/use-agent.mdx)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Hackathon judging](https://www.wemakedevs.org/hackathons/ptc#judging)
