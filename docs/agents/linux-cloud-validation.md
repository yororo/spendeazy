# Reusable Linux cloud validation

For a new cloud checkout, follow [cloud setup](../testing/local-testing-cloud.md): run
`bash scripts/cloud/bootstrap.sh`, then `bash scripts/cloud/validate.sh`.
These commands resolve the checkout location themselves and use ignored local
tool/cache directories. Standard validation needs Docker and uses fresh disposable
databases; it does not need Clerk/Google credentials or an Android device.
Use the optional Android setup only for native work. Do not claim native UI or
Google sign-in passed based on unit tests or bundle export.
