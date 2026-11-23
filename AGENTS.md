# Shopify app development

This app is scaffolded from a Shopify app template. See the README for framework-specific details.

Use the [Shopify AI Toolkit](https://shopify.dev/docs/apps/build/ai-toolkit) for all Shopify API and platform work. If missing, install it in the agent host per that page (or `npx skills add Shopify/shopify-ai-toolkit --list` for skill-compatible hosts) — do not add tooling to this repo.

## Production deploy (user expectation)

When the user requests code changes for DrobeBook, **ship to live** after the work is done: push `main` to Railway, and run `shopify app deploy --config shopify.app.production.toml --allow-updates` when theme extension files change. See `.cursor/rules/production-deploy.mdc`.
