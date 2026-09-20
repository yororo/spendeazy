# Store frontend category rules with atomic replacement

The accepted target design in [Personal and Shared Spaces](../../../docs/adr/0002-personal-and-shared-spaces.md) supersedes this decision's per-User serialization scope and last-write-wins behavior with Space scoping and stale-edit detection. Implementation is pending; the remainder of this decision is retained.

The API stores Exact and Contains Category Rules; the frontend owns rule evaluation, overlap precedence, and Remember (which creates Exact Rules). Statement Import continues accepting reviewed Category assignments. This keeps categorization policy with the review workflow rather than introducing a second matching implementation in the API.

Category replacement is atomic and last-write-wins, without client revisions. Rules retain identity by normalized pattern and match type, preserving IDs and creation timestamps for retained rules and update timestamps for unchanged display patterns. Recreating every row would make retries unnecessarily change public identities. All rule mutations serialize per User so replacement, individual mutations, and cross-Category uniqueness checks observe a consistent rule set.

Replacement requires an active owned Category even when clearing its rules. Existing individual maintenance of rules on inactive Categories remains allowed; creation and reassignment require an active Category. Duplicate conflicts identify the conflicting owned Category and request field, including duplicates within a replacement request.
