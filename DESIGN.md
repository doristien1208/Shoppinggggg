---
version: alpha
colors:
  background: '#f5f8fb'
  surface: '#ffffff'
  text: '#182b46'
  muted: '#53657b'
  primary: '#21766d'
  soft: '#e6f3f1'
  border: '#dbe3ed'
  danger: '#a52d36'
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, PingFang TC, Noto Sans TC, sans-serif'
  utility:
    fontFamily: 'ui-monospace, monospace'
rounded:
  card: '16px'
  button: '12px'
spacing:
  base: '4px'
components:
  item:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
---
## Overview
A pocket shopping notebook for Traditional Chinese users travelling and buying goods in Japan. Product register: fast one-handed checkoff, not a marketing page. The signature is a dark blue compact trip-total panel above place chips. No decorative Japan stereotypes or oversized hero.
## Colors
Runtime owner is site/styles.css :root. background → --bg, surface → --surface, text → --ink, muted → --muted, primary → --brand, soft → --soft, border → --line, danger → --danger. Update this document and CSS together. Light theme only.
## Typography
System Traditional Chinese fonts avoid network font swaps; monospace for yen and progress. 16px item names with 1.5 line height, 30px mobile heading.
## Layout
Single natural document scroller, max-width 800px; 16px phone gutters. Horizontal location chips are scrollable. Item name wraps without hiding checkbox. Purchase-state filters are native radio controls. Buyer filter is a labelled native select; platform popup geometry and appearance are accepted, with touch and keyboard behavior owned by the OS. Location navigation uses aria-pressed buttons rather than ARIA tab roles.
## Elevation & Depth
Flat cards with borders, no decorative shadows. Native modal dialog owns focus trap and inert background.
## Shapes
16px list cards, 12px buttons, 20px summary, 22px dialog.
## Components
app.js owns list rendering, status messaging, form validation and dialog behavior. core.js owns JSON validation and the backend API client; worker/index.js owns authentication and GitHub persistence. Header and form buttons share CSS primitives. Form fields and checkbox use native interaction; buyer select uses native OS popup.
## Do's and Don'ts
Use text and checkbox state to convey completion; colour is secondary. Keep 44px touch targets and focus rings. Show precise loading/errors with retry. All product text is Traditional Chinese. No GitHub token or raw password in frontend storage; only an expiring session per tab. No browser alert/confirm/prompt or HTML interpolation from item data. Respect reduced motion and forced colours.
