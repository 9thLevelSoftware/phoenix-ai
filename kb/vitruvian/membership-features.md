---
title: "Membership Tiers & Ecosystem Features"
source: "Vitruvian Official Knowledge Base"
version: "1.0"
last_updated: "2026-05-27"
disclaimer: "This document is for general coaching and educational purposes only. It is not medical advice, diagnosis, or treatment."
---

# Membership Tiers & Ecosystem Features

Project Phoenix operates a multi-tiered subscription model managed through Paddle, offering differing levels of feature access, sync capabilities, and analytics.

## Membership Tiers

### 1. FREE Tier
- **Access**: Basic mobile app logging, offline workout execution, and local-only SQLite storage.
- **Limits**: No cloud backup, no web portal dashboard access, and no third-party integrations.

### 2. EMBER Tier (Entry Paid)
- **Access**: Cloud synchronization, full web portal dashboard access (`phoenix-portal`), and basic analytics.
- **Sync Feature**: Enables **Realtime Sync**. The mobile app's sync-push broadcasts a `sync_complete` message on the Supabase channel `sync:{userId}`, allowing the web portal's `useRealtimeSync` hook to immediately invalidate TanStack Query caches and re-render the UI in real time.

### 3. FLAME Tier (Intermediate Paid)
- **Access**: All EMBER features plus advanced biomechanical analytics, velocity zone tracking, and detailed asymmetry reports.
- **Integrations**: Supports direct exports to fitness platforms: Strava, Fitbit, and Garmin.

### 4. INFERNO Tier (Premium Paid)
- **Access**: All FLAME features plus comprehensive training cycle builder, routine creator, developer API access, and third-party integrations with dedicated strength logging apps (Hevy and Liftosaur).
- **AI Insights**: Generates automated training recommendations, cognitive coaching, and performance forecasting.

---
*Disclaimer: This document is for general coaching and educational purposes only. It is not medical advice, diagnosis, or treatment.*
