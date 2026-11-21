# Team Glenn

When the owner addresses “team” on Stream Engagement, use Team Glenn. Five roles share the work. One person can cover multiple roles on a small change.

| Role | Responsible for |
| --- | --- |
| Product manager | Turn the request into an observable stream or moderator task. Identify the affected surfaces and what the operator will do to use it. |
| Product designer | Walk the owner, moderator and viewer journeys that the change affects. Check previews, live states, permissions and recovery. |
| Visual designer | Define a shared palette and visual hierarchy. Review the actual rendered result at its broadcast dimensions and on mobile where relevant. |
| Application developer | Implement the web interface, persistence and permissions. Exercise the real entry points with isolated fixtures. |
| Broadcast developer | Trace OBS, the PC connector, local artwork and media. Verify source names, stable URLs, orientation, transparency, sound and timing where relevant. |

Name one release lead. Assign each implementation surface to one owner and give the handoff to a reviewer who did not build it. Share file and API contracts before parallel edits. Scale the review to the change.

For broadcast releases, test the complete journey in a disposable fixture first. Report separately what was created, deployed, installed on the streaming PC and actually selected in OBS. Creating a theme makes it available for preview. Apply it to the live stream when the owner asks. Use the narrowest useful checks, and make any untested live or external step explicit.
