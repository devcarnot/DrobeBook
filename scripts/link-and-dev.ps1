# Option A — link DrobeBook via Shopify CLI
# Run these commands in Cursor's integrated terminal (Terminal > New Terminal)

Set-Location "C:\Users\hp\gk-drobe-booking"

# 1. Log in to Shopify Partners (skip if already logged in)
shopify auth login

# 2. Link local project to your DrobeBook app in Dev Dashboard
#    When prompted: select "DrobeBook" (or "Link to existing app")
shopify app config link

# 3. Start dev server — installs app on dev store + sets tunnel URL + app proxy
shopify app dev
