# Skill Observation Log

Observations captured during task-oriented work.

**Status key:** OPEN = not yet actioned | ACTIONED (YYYY-MM-DD) = skill updated/created | DECLINED (YYYY-MM-DD) = user decided not to pursue — resolved statuses always carry their resolution date

---

## 2026-11-18

### Observation 1: Reuse existing in-app logo mark for favicons

**Status:** OPEN
**Date:** 2026-11-18
**Session context:** User asked for a relevant favicon in the GoodPanda React app; the UI already contained an SVG `LogoMark` component.
**Skill:** design
**Type:** open-source
**Phase/Area:** Brand asset creation / favicon selection

**Issue:** When an app has no favicon, generating a new one from scratch can drift from the established brand mark and adds unnecessary design work.

**Suggested improvement:** In frontend/design workflows, check for an existing in-app logo component (e.g. an SVG `LogoMark`) before creating a favicon, and derive the favicon geometry and colors from it.

**Principle:** Favicons should reuse the existing brand mark when one exists, preserving visual identity and avoiding redundant asset design.
