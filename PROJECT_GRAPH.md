<!--
  Auto-generated cross-repo context map ("graphify") — 2026-06-11.
  ONE product, TWO repos: ~/pearlbloom (Next.js storefront) + ~/pearlbloom-admin (Vite admin).
  Dense, file:line-cited map of architecture, Firestore model, slug/doc-id plan, integrations, issues.
  Treat as a starting index, not gospel — verify file:line refs before relying on them.
-->

# PearlBloom Project Graph (storefront + admin)

## 1. System overview

PearlBloom is **two repositories that form one product**, sharing **one Firestore database**. The admin app **authors** all catalog/config data; the storefront **reads** it (plus authors orders/reviews/users from the customer side).

- **STOREFRONT** `/Users/maazansari/pearlbloom` — Next.js App Router. Reads Firestore two ways: server-side via **firebase-admin** (`libs/firebase-admin.ts` `dbAdmin`, used in SSR libs + API routes) and client-side via the **Firebase client SDK** (`dbClient`). State in Zustand stores, data fetching with SWR, analytics via PostHog. Payments via Razorpay; shipping serviceability via NimbusPost + postalpincode.in. Customer auth is **phone-OTP** (`app/login/page.tsx`).
- **ADMIN** `/Users/maazansari/pearlbloom-admin` — Vite + React 19 + React Router v6 (`<Routes>` in `src/App.jsx`, not `createBrowserRouter`). Firebase **client SDK only** (`src/firebase.ts`: Auth, Firestore `db`, Storage). Images go to **Cloudinary** through **Firebase Functions v2** (`functions/`). Admin auth is email/password.

**Data flow:** Admin pages → `setDoc`/`addDoc`/`updateDoc` on shared Firestore (`products`, `collections`, `coupons`, `siteSettings/main`, `homepageSections`, `bannerCarousels`) → Storefront SSR libs (`libs/products.server.ts`, `libs/collections.server.ts`, `libs/homepage.server.ts`, `libs/navigation.server.ts`) and client libs read them by **slug-query → id → doc-get** (because doc-id ≠ slug). Customer side writes back `orders` (`utils/placeorder.ts`), `reviews` (`components/WriteReviewModal.tsx`), `users` (`app/login/page.tsx`). Order paid-status is finalized server-side by `app/api/razorpay/verify/route.ts`. Admin then reads/updates `orders` (status only) and reads `reviews`/`users`/analytics.

- **NO `firestore.rules` exists in either repo** — security relies entirely on out-of-band Firestore rules; neither app enforces authorization beyond authentication.

## 2. Admin app

**Auth/shell:** `LoginPage.tsx:17` email/password `signInWithEmailAndPassword` → `AuthContext.tsx:17` `onAuthStateChanged` exposes `{user,loading}` → `ProtectedRoute.tsx:9` redirects to `/login` if `!user`. **No role/claims check — any authenticated Firebase user is a full admin.** `AdminLayout.tsx` renders sidebar + realtime unread-chat badge via `onSnapshot(query(chats, where lastSender=='user'))`.

**Product authoring** — `ProductEditPage.tsx`:
- Doc-id: `const idToUse = isNew ? crypto.randomUUID() : id!` (`:488`), ref `doc(db,'products',idToUse)` (`:489`). **Slug is a field**, `slugToSave = form.slug || slugify(form.name)` (`:491`), saved at `:520`. Single `setDoc(...,{merge:true})` at `:516-545` writing: name, slug, brand, price, shippingRate (or `deleteField()`), currency, shortDescription, description, attributes[], categories[], collectionId, isFeatured, thumbnailUrl, images[], imagesMeta (url→Cloudinary public_id), marketplaces{amazon,flipkart,meesho}, inventory{trackStock,stock,discountPercent}, variants[]{id,attributes[],price,stock,discountPercent,images[]}, updatedAt (`serverTimestamp`), createdAt only when new.
- Edit loads `getDoc(doc(db,'products',id))` (`:231`); legacy metal/gemstone/sku promoted to attributes (`:248-251`).
- `ProductsPage.tsx`: list `getDocs(collection products)` cached `'products:list'` 2min (`:101`); delete `deleteDoc(doc(products,id))` (`:125`) + invalidate `'products:list'`/`'dashboard:counts'`; edit links `/products/{p.id}` (`:201`); renders raw `collectionId` as "Collection" label (`:219`).

**Collection authoring** — `CollectionsPage.tsx`:
- Create `addDoc(collection(db,'collections'),payload)` → **auto-id** (`:258`); edit `updateDoc(doc(db,'collections',editingId),payload)` (`:250`); delete `deleteDoc`. Slug normalized `slugify(form.slug||normalizedName)` (`:222`), format-validated `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` (`:229`) but **not** uniqueness-checked. Fields: name, slug(field), description, priority, isFeatured, thumbnail{url,public_id}. Cached `'collections:list'`.

**Coupon authoring** — `CouponEditPage.tsx`: `setDoc(doc(db,'coupons',couponCode),{...},{merge:true})` (`:367`) where **doc-id IS the normalized uppercase code** (`normalizeCode` `:23-30`, uppercase/spaces→`-`/strip non-`[A-Z0-9_-]`/slice 32). Optional fields use `deleteField()`. `CouponsPage.tsx`: toggle `updateDoc(doc(coupons,code))`, delete `deleteDoc(doc(coupons,code))` — keyed by code.

**Other writes:** `HomepagePage.tsx` homepageSections create `addDoc` auto-id (`:433`) / update `updateDoc` (`:426`); bannerCarousels `setDoc(doc(db,'bannerCarousels',placement))` doc-id=placement (`:348`). `SettingsPage.tsx` singleton `setDoc(doc(db,'siteSettings','main'),{...},{merge:true})` (`:342`). `ShipmentsPage.tsx` `setDoc(siteSettings/main,{shipments:{...},...duplicated top-level},{merge:true})` (`:235`). `OrderDetailPage.tsx` status-only `updateDoc(doc(db,'orders',orderId),{status,updatedAt})` (`:250`); client-side PDF invoice via `lib/invoicePdf.ts` from `siteSettings/main.invoice` (`:358`). `ChatDetailPage.tsx` reply `addDoc(chats/{id}/messages,{sender:'admin',...})` (`:169`) + `setDoc(chat,{lastMessage,...,lastSender:'admin'},{merge:true})` (`:175`); read-marker sets `lastSender:'admin'` (`:100`).

**Read-only pages:** `OrdersPage.tsx` (paginated `where status`/`orderBy createdAt|total`/`startAfter`/`limit`, `:252`; `resolveUser` N extra users reads `:141-219`), `UsersPage.tsx`, `UserDetailPage.tsx` (`users/{id}` + `where userId==` orders), `ReviewsPage.tsx` (read `:83`, delete `:165`, loads up to 2000 products `:84`), `ChatsPage.tsx`, `AnalyticsPage.tsx`, `DashboardPage.tsx` (`getCountFromServer` `:46-53`, cached 5min).

**Cloudinary / Functions:** Admin never uses Firebase Storage for images. Files read as base64 dataURL → `httpsCallable('uploadImageCallable')` (region us-central1) → `functions/src/handlers/uploadHandler.ts` (≤8MB, **folder hardcoded `'products'` at `:31`**, ignoring caller's `folder` param) → `functions/src/lib/cloudinary.ts` (`upload_stream`/`destroy`). Response `{url,public_id}` stored; removal calls `deleteImageCallable`. `ProductEditPage` gets callables via `src/lib/functions.ts` (`getUploadCallable`/`getDeleteCallable`, emulator gated by `VITE_USE_FUNCTIONS_EMULATOR`); `CollectionsPage.tsx:188` (folder:'collections') and `SettingsPage.tsx:248` (folder:'hero') call inline `httpsCallable` — both folder params are silently ignored. Other functions: `nimbuspostCouriersCallable` (`ShipmentsPage`), `posthogReportHttp` (`AnalyticsPage`, Bearer idToken via `src/lib/functions.ts:120`).

## 3. Storefront app

**Route surface (App Router):** `app/product/[slug]/page.tsx` (PDP, `getProductBySlug` `:65`,`:177`), `app/collections/[slug]/page.tsx` (`getCollectionBySlug` `:22`,`:114` then `getProductsByCollectionId(collection.id)` `:120`), `app/orders/[displayId]/page.tsx` (query by displayId), `app/checkout/page.tsx`, `app/login/page.tsx`, plus API routes (§5).

**Server/client split:**
- **Server (firebase-admin, SSR):** `libs/products.server.ts`, `libs/collections.server.ts`, `libs/homepage.server.ts` (`homepageSections orderBy('order','asc')` `:5`), `libs/navigation.server.ts`. All API routes use `dbAdmin`.
- **Client (Firebase client SDK):** `libs/products.client.ts`, `libs/collections.client.ts`; `utils/placeorder.ts`, `components/WriteReviewModal.tsx`, `app/login/page.tsx`, `app/orders/[displayId]/page.tsx` all write/read via `dbClient`.

**Stores/libs:** Zustand stores + SWR (cart/checkout orchestration in `app/checkout/page.tsx`). `libs/pricing.ts` pure helpers (NOT used to validate amounts server-side).

**Product read flow (SSR — the optimized path):** `getProductBySlug` → `getProductBySlugRaw` (`products.server.ts:186`). Step 1 `getProductIdBySlugCached` (`:109-128`): `collection('products').where('slug','==',slug).select().limit(1)` in `unstable_cache(revalidate 300, tags ['products'])` returning doc-id. Step 2 `getProductById(id)` (`:134-149`): direct `doc(id).get()`. Step 3 cache-miss fallback **re-runs** `where('slug','==',slug).limit(1).get()` (`:197-201`). Step 4 hard fallback `data/catalog.json` (`:212`). Net: 1 query + 1 doc-get (or 1 query when cache warm).

**Product read flow (client SDK):** `products.client.ts:141` `getProductBySlug` — in-memory `slugToIdCache` Map (`:22`); on hit `getProductById` direct doc-get (`:150`); else `where('slug','==',slug),limit(1)` (`:154-158`). `cacheProduct` (`:114`) populates both caches.

**Collection read flow (SSR):** `getCollectionBySlug` (`collections.server.ts:108`) → `getCollectionIdBySlugCached` (`:11-30`) `where('slug','==',slug).select().limit(1)` (`unstable_cache 300s, tag 'collections'`) → `getCollectionById` direct `doc(id).get()` (`:35`); fallback query (`:121-125`). Then `getProductsByCollectionId(collection.id)` → `where('collectionId','==',collectionId)` (`:343-352`, PAGE_SIZE 8). **Client path:** `collections.client.ts:70` in-memory `slugToIdCache` (`:28`) + fallback `where('slug','==',slug),limit(1)` (`:85-89`).

**Navigation:** `navigation.server.ts:120` `getNavigationRaw` → `getAllCollections` (`collections.server.ts:72` full scan) → `buildNav` matches collections to 4 hardcoded parents (earrings/bracelets/necklaces/rings) by slug prefix/substring (`matchCategory:66`, uses `priority` `:98`); hrefs `/collections/${c.slug}`; `unstable_cache` tag `'collections'`.

## 4. Firestore data model

For each collection: **doc-ID convention (quoted from write) → key fields → read-by-slug/id paths.**

- **products** — doc-id `crypto.randomUUID()` for new (`ProductEditPage.tsx:488`), reused `id!` on edit; **slug is a field** (`:491`→`:520`), not enforced unique. Written `setDoc(...,{merge:true})` `:516-545`. Fields: name, slug, brand, price, shippingRate(optional/`deleteField`), currency, shortDescription, description, attributes[{key,value}], categories[], collectionId, isFeatured, thumbnailUrl, images[], imagesMeta{url→public_id}, marketplaces, inventory, variants[], createdAt/updatedAt. Type `types/products.ts:30` (id & slug both string). **Read by slug:** `products.server.ts:113`/`:199`, `products.client.ts:156`. Read by id: `:136`. Admin reads `ProductsPage.tsx:101`, `CouponEditPage.tsx:206`, `HomepagePage.tsx:204`, `ReviewsPage.tsx:84`; delete `ProductsPage.tsx:125`.
- **collections** — doc-id **auto-id** `addDoc` (`CollectionsPage.tsx:258`); slug field normalized `:222`, format-validated `:229`, not unique. Fields: name, slug, description, priority, isFeatured, thumbnail{url,public_id}. Type `types/collections.ts:6`. **Read by slug:** `collections.server.ts:16`/`:123`, `collections.client.ts:87`. `products.collectionId` references this **auto-id** (join `products.server.ts:343`).
- **orders** — doc-id **auto-id** `addDoc(collection(dbClient,'orders'),order)` (`utils/placeorder.ts:13`, **client-side**); `displayId = PB-${date}-${orderRef.id.slice(-6).toUpperCase()}` derived from auto-id (`:21`) and written back `updateDoc(orderRef,{displayId})` (`:24`); mirror `users/{uid}/orders/{orderRef.id}` (`:29-38`). Fields: userId, phone, items[], subtotal, shipping, total, discount, coupon, address, status (pending→paid), displayId, payment (added by verify). **Read by displayId** (query, not doc-get): `app/orders/[displayId]/page.tsx:87-90`. Server updates by auto-id: `verify/route.ts:100`.
- **coupons** — doc-id **IS the normalized uppercase code** `setDoc(doc(db,'coupons',couponCode),{...})` (`CouponEditPage.tsx:367`; `normalizeCode:23`). Fields: code (dup of id), title, active, discount{type,value,maxDiscount}, appliesTo{scope,productIds[],collectionIds[],categories[]}, minSubtotal, usageLimit, perUserLimit, usedCount, startAt, endAt. **Read by id:** `app/api/coupons/validate/route.ts:329` `doc(code).get()` with `where('code','==',code)` fallback `:332`.
- **reviews** — doc-id **auto-id** `addDoc(collection(dbClient,'reviews'),{...})` (`WriteReviewModal.tsx:64`, dup-guard query `:52`). Fields: productId, productName, productImage, userId, userName, rating, text, createdAt(ISO), verified, orderId. Type `types/reviews.ts:1`. Admin read `ReviewsPage.tsx:83`, delete `:165`.
- **users** — doc-id **Firebase Auth UID**. Create `setDoc(doc(dbClient,'users',uid),newUser)` (`app/login/page.tsx:172`/`:186`); profile merge `:224`/`:236`; `lastLoginAt` `:192`. Subcollections: `users/{uid}/addresses` (auto-id, `app/addresses/AddressClient.tsx:347`), `users/{uid}/orders` (`placeorder.ts:30`). Type `types/user.ts:17`. Admin read-only.
- **siteSettings/main** — **singleton** literal id `'main'` `setDoc(doc(db,'siteSettings','main'),{...})` (`SettingsPage.tsx:342`, `ShipmentsPage.tsx:235`, both merge). Fields: siteName, testMode, hero{}, footer{links,socialLinks}, invoice{...}, shipments{courierWhitelist[],deliverablePincodes[],globalShippingRate,freeShippingAbove}, **plus duplicated top-level deliverablePincodes/globalShippingRate/freeShippingAbove**. Read: `OrderDetailPage.tsx:358` (invoice), `verify/route.ts:42` (testMode).
- **homepageSections** — doc-id **auto-id** `addDoc` (`HomepagePage.tsx:433`). Fields: page('home'), title, type, order, productIds[], collectionIds[], config{}. Read `homepage.server.ts:5` `orderBy('order','asc')`.
- **bannerCarousels** — doc-id **placement string** (`'home_top'|'home_bottom'`) `setDoc(doc(db,'bannerCarousels',placement))` (`HomepagePage.tsx:348`). Fields: active, placement, size, title, subtitle, items[{id,imageUrl,alt,href,label,active,order}].
- **chats** — doc-id external/per-user. Fields: userId/uid, user{...}, lastMessage, lastSender, lastMessageAt. Subcollection `chats/{id}/messages` {sender,text,createdAt}. Admin writes `ChatDetailPage.tsx:175`/`:169`.
- **newsletterSubscribers** — only counted `getCountFromServer` (`DashboardPage.tsx:49`).

## 5. Backend & integrations

**Storefront API routes (all `dbAdmin`):**
- `app/api/razorpay/order/route.ts` — POST **public/no-auth**; `orders.create` with client `amount × 100` paise, **no validation vs order doc** (`:11/:20`).
- `app/api/razorpay/verify/route.ts` — POST **public/no-auth**; verifies HMAC only (`:87-97`), then `dbAdmin.collection('orders').doc(orderId).update({status:'paid',payment,updatedAt:Date.now()})` (`:100-115`). **No amount check, no caller auth, no ownership check.** PostHog `purchase` unless testMode (`getTestMode` reads `siteSettings/main`, `:42`/`:118`). Returns authoritative `displayId` (`:156`). No webhook.
- `app/api/coupons/validate/route.ts` — POST **public/no-auth**; `doc(code).get()` (`:329`), then reads orders for usageLimit (`:381`), orders by userId for perUserLimit (`:402`), products per item for scope (`:428`). `userId` taken from request body (unauthenticated).
- `app/api/coupons/active/route.ts` — GET public; coupons where active.
- `app/api/shipping/nimbus/serviceability/route.ts` — GET public; NimbusPost login token cached (module var, no TTL).
- `app/api/geo/pincode/route.ts` — GET public; proxies postalpincode.in.
- `app/api/collections/[slug]/products/route.ts` — GET public; `getProductsByCollectionId`.

**firebase-admin:** `libs/firebase-admin.ts` `dbAdmin` for all SSR libs + API routes. **Client SDK** (`dbClient`) authors orders/reviews/users.

**Admin Firebase Functions (v2):** `functions/src/callables.ts` — `uploadImageCallable`/`deleteImageCallable` (**auth guard commented out**, `:18-20`), `posthogReportCallable`/`nimbuspostCouriersCallable` (check `req.auth.uid` only, no admin claim, `:124`/`:249`). `functions/src/httpWrappers.ts` — `uploadImageHttp`/`deleteImageHttp` (**CORS only, no token**, `:15`/`:52`), `posthogReportHttp` (verifies ID token, `dashboard_batch` 14 queries, `:186`). `functions/src/lib/cors.ts:30` **reflects any Origin**. `functions/src/lib/nimbuspost.ts:16` token cached 6h.

**Auth model:** Storefront customers = phone-OTP (no App Check). Admin = email/password, **authentication-only, no authorization** (any signed-in user is admin). No Firestore rules in either repo.

## 6. SLUG / doc-ID action plan (priority)

**Current write doc-ids:** products = `crypto.randomUUID()` (`ProductEditPage.tsx:488`); collections = auto-id `addDoc` (`CollectionsPage.tsx:258`). Slug is only a field on both (`products` `:520`, `collections` `:222`).

**Current slug read paths (4 query sites + caches):**
- `products.server.ts:113` (cached) and `:199` (fallback) — `where('slug','==',slug)`; cache layer `getProductIdBySlugCached` `:109` + `unstable_cache`.
- `products.client.ts:156` `where('slug','==')` + in-memory `slugToIdCache` `:22`.
- `collections.server.ts:16` (cached) / `:123` (fallback) + `getCollectionIdBySlugCached` `:11`.
- `collections.client.ts:87` + `slugToIdCache` `:28`.

**Exact change set to make doc-id == slug → direct `doc(slug).get()`:**

*Admin (writes):*
1. `ProductEditPage.tsx:488-491` — compute `slugToSave` **before** the doc ref, then `const idToUse = isNew ? slugToSave : id!; doc(db,'products', idToUse)`. Keep `slug` field for back-compat. Add a **pre-write existence guard** (`getDoc(doc(products,slug))`) on create to reject collisions (no uniqueness check exists today).
2. `CollectionsPage.tsx:250/258` — replace create `addDoc(...)` with `setDoc(doc(db,'collections', normalizedSlug), payload)`; add existence guard. Edit path `updateDoc(doc(collections,editingId))` (`:250`) keeps working only if `editingId` already equals slug post-migration.
3. **collectionId coupling (highest-risk blocker):** products store `collectionId = collection auto-id` (`ProductEditPage.tsx:529`, dropdown value `collection.doc.id` `:198-203`); join `where('collectionId','==',collection.id)` (`products.server.ts:343`), page passes `collection.id` (`collections/[slug]/page.tsx:120`). If collection doc-id becomes slug, set `collectionId = collection.slug` at author time AND migrate every existing `product.collectionId` to the slug, or collection pages return zero products.

*Storefront (reads — simplify after migration):*
4. `products.server.ts` — `getProductBySlug` collapses to single `getProductById(slug)`/`doc(slug).get()`; delete `getProductIdBySlugCached` (`:109-128`) and the redundant fallback query (`:197-201`).
5. `products.client.ts:141-158` — replace query with `doc(dbClient,'products',slug)`; delete `slugToIdCache` (`:22`).
6. `collections.server.ts:11-30/121-125` — collapse to `doc(slug).get()`; delete cache layer. `getProductsByCollectionId` keeps working since `collectionId` now equals collection slug.
7. `collections.client.ts:70-89` — replace query with `doc(slug)`; delete `slugToIdCache` (`:28`).
8. Drop the Firestore single-field index on `slug` for both collections.

**Migration considerations:**
- **Existing docs:** backfill script — for each product/collection, create new doc keyed by slug (copy data), rewrite all `product.collectionId` to the collection slug, delete old auto-id docs. Run while readers still tolerate query fallback.
- **Slug uniqueness:** today neither write enforces it (products none; collections format-only `:229`); `limit(1)` silently picks one (`products.server.ts:201`). Under doc-id==slug a collision **silently overwrites** — strictly worse without a pre-write guard.
- **Slug mutability:** with doc-id==slug, renaming a slug = delete+recreate (orphans old doc, breaks SEO/inbound links, and must update referencing `product.collectionId`). Either forbid slug edits or implement rename = create-new + migrate references + delete-old.
- **orders/displayId** (same anti-pattern, out of product/collection scope): `displayId` is a queried secondary field (`orders/[displayId]/page.tsx:88`) derived from the auto-id (`placeorder.ts:21`) — chicken/egg. To make order doc-id == displayId, pre-allocate `doc(collection(dbClient,'orders')).id` and build displayId from it before the write.

## 7. Known issues / costly patterns

- **No Firestore rules anywhere** — `firestore.rules` absent in both repos; admin `firebase.json` only configures functions. All client writes (`placeorder.ts`, `WriteReviewModal.tsx`) governed only by out-of-band rules.
- **Payment amount never validated server-side** — `razorpay/order/route.ts:11` trusts client amount; `verify/route.ts:92` checks only HMAC, never compares captured amount to `order.total`, and has no caller auth/ownership (`:100`). Anyone with an `orderId` + valid signature can mark any order paid. No webhook. `updatedAt` written as `Date.now()` (`:114`) — inconsistent type vs other writes.
- **Admin: authentication without authorization** — `ProtectedRoute.tsx:9` / `AuthContext.tsx:17` check only sign-in; any Firebase Auth account can write products/coupons/settings.
- **Image functions unauthenticated** — `callables.ts:18-20` auth guard commented; `httpWrappers.ts:15/:52` no token (CORS only); `cors.ts:30` reflects any Origin. Anyone can upload (cost) or delete any image by `public_id` (data loss).
- **Cloudinary folder hardcoded** — `uploadHandler.ts:31` forces `folder='products'`; `CollectionsPage.tsx:188` and `SettingsPage.tsx:248` `folder` params silently ignored; all images land in `products/`.
- **doc-id ≠ slug** for products (`ProductEditPage.tsx:488`) and collections (`CollectionsPage.tsx:258`) — every storefront slug lookup is a query + needs a slug index + bespoke `slugToIdCache` layers (see §6).
- **No slug uniqueness** — products none (`:520`), collections format-only (`:229`); two products can share a slug and `limit(1)` silently picks one (`products.server.ts:201`).
- **Coupon enforcement bypassable** — `validate/route.ts` takes `userId` from unauthenticated body; usageLimit/perUserLimit checks fan out unbounded reads per call (orders `:381`/`:402`, products `:428`). Admin only displays usedCount read-only (`CouponsPage.tsx:283`).
- **Duplicated/clobbering shipping settings** — `SettingsPage.tsx:381-384` and `ShipmentsPage.tsx:238-246` both write `deliverablePincodes` (Shipments also `globalShippingRate`/`freeShippingAbove`) under `siteSettings/main.shipments` AND top-level; saving one page can clobber the other's view.
- **Stale admin list cache** — `'products:list'` 2min sessionStorage (`ProductsPage.tsx:98`); create/edit in `ProductEditPage` does NOT invalidate it (only delete does, `:128`), so new products may not appear until TTL.
- **Expensive read patterns** — `OrdersPage.resolveUser` N extra users reads per row (`:141-219`); `ReviewsPage` loads up to 2000 products to map names (`:84`); `getAllCollections` full scans for nav (`collections.server.ts:72`); server slug fallback re-runs the same query twice on a true miss (`products.server.ts:189`→`:197`; `collections.server.ts:113`→`:121`).
- **orders looked up by `displayId` via query** (`orders/[displayId]/page.tsx:88`) despite being deterministic from the auto-id (`placeorder.ts:21`) — human-facing id ≠ doc-id forces a query.
- **Divergent Collection type** — `types/collections.ts:6` has priority+isFeatured; `collections.client.ts:15` redefines a local Collection without them, while `navigation.server.ts:98` relies on `priority` (drift risk).
- **No App Check** on phone-OTP customer auth.
- **Dead surface** — Firebase Storage initialized but unused (`firebase.ts:39`, all images via Cloudinary); unused `CarouselFormSkeleton2` (`HomepagePage.tsx:103-135`); `libs/pricing.ts` helpers not used for server-side amount validation.

(Correction vs source maps: `utils/placeorder.ts` is **client-side only** (`dbClient`, `:13`); there is no separate "server placeorder.ts" — the displayId is generated once, client-side, and `verify/route.ts:156` merely echoes the stored value.)
