# TFG-16 — Board Task Card Label Pills: Always Light Text Color

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Label pill'lerdeki yazı rengini her zaman açık renk (`#f7f7f8`) yap, kontrast hesabını kaldır.

**Architecture:** 2 frontend dosyada değişiklik — shared `label-pill.tsx` bileşeni ve `task-card.tsx`. Backend değişikliği yok.

**Tech Stack:** React, TypeScript, shadcn/ui

---

## Grill-Me Kararları

| # | Karar |
|---|--------|
| 1 | **Tüm label pill'lerde daima açık renk yazı** — kontrast hesabı yok, `#f7f7f8` sabit |
| 2 | **Kapsam** — Board'daki task card label pill'leri, detail sidebar'daki label pill'leri, label manager, public task page dahil |
| 3 | **Renk** — `#f7f7f8` (design system açık ton) |

## Mevcut Durum

Label pill'lerde `isLightColor()` fonksiyonu ile arka plan renginin parlaklığı hesaplanıyor (luminance threshold 0.55). Parlak renklerde (`#F97316` turuncu, `#84cc16` lime) yazı rengi koyu (`#030404`) oluyor.

---

### Task 1: `label-pill.tsx` — Shared bileşende kontrast fonksiyonunu kaldır

**Objective:** 4 render noktasını (kanban list view, detail sidebar, label manager, public task page) düzelten shared bileşeni güncelle.

**Files:**
- Modify: `apps/web/src/components/label-pill.tsx`

**Step 1: `isLightColor()` fonksiyonunu sil**

```tsx
// Silinecek satırlar (~7-15):
const isLightColor = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55;
};
```

**Step 2: `textColor` değişkenini sabit yap**

```tsx
// Before:
const textColor = isLightColor(color) ? '#030404' : '#f7f7f8';

// After:
const textColor = '#f7f7f8';
```

**Step 3: Derleme kontrolü**

```bash
cd /Users/emre/taskforge && pnpm --filter @taskforge/web exec tsc --noEmit
```

Expected: PASS (veya sadece label-pill ile ilgili olmayan hatalar)

---

### Task 2: `task-card.tsx` — Board card view'da kontrast fonksiyonunu kaldır

**Objective:** Board sütunlarındaki task kartlarındaki label pill yazı rengini düzelt.

**Files:**
- Modify: `apps/web/src/components/task-card.tsx`

**Step 1: `contrastTextColor()` fonksiyonunu sil**

```tsx
// Silinecek satırlar (~33-40):
const contrastTextColor = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#030404' : '#f7f7f8';
};
```

**Step 2: Label pill render'ında sabit renk kullan**

```tsx
// Before:
style={{ backgroundColor: label.color, color: contrastTextColor(label.color) }}

// After:
style={{ backgroundColor: label.color, color: '#f7f7f8' }}
```

**Step 3: Derleme kontrolü**

```bash
cd /Users/emre/taskforge && pnpm --filter @taskforge/web exec tsc --noEmit
```

Expected: PASS

---

### Task 3: Görsel doğrulama

**Objective:** Değişikliklerin çalıştığını manuel olarak doğrula.

**Step 1: Dev server'ı başlat**

```bash
cd /Users/emre/taskforge && pnpm dev
```

**Step 2: Board'da farklı renklerde label'lı kartları kontrol et**
- Tüm label pill'lerde yazı rengi açık (`#f7f7f8`) olmalı
- Hiçbir label'da koyu yazı olmamalı

**Step 3: Detail sidebar'da label pill'lerini kontrol et**
- Aynı şekilde açık renk yazı

**Step 4: Label manager'da kontrol et**
- Aynı şekilde açık renk yazı

---

## Backend

**Değişiklik yok.** Tamamen frontend görsel düzeltme.
