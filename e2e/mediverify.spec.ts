import { test, expect, type Page } from "@playwright/test";

const API = "http://localhost:8000";
const PASSWORD = "12345678";

const ACCOUNTS = {
    admin: "org_1_admin@example.com",
    compliance_officer: "org_1_compliance@example.com",
    hr: "org_1_hr@example.com",
    clinician: "org_1_nurse@example.com",
    super_admin: "ayush.amberkar@dynamisch.co",
} as const;

const FULL_NAV = ["Dashboard", "Clinicians", "Documents", "AI Chat", "Reports"];

const EXPECTED_NAV: Record<keyof typeof ACCOUNTS, string[]> = {
    admin: FULL_NAV,
    compliance_officer: FULL_NAV,
    hr: FULL_NAV,
    clinician: ["Clinicians", "Documents", "AI Chat", "Reports"],
    super_admin: ["AI Chat", "Onboard Org", "Cost Management"],
};

async function login(page: Page, email: string) {
    await page.addInitScript(() => {
        // Runs on EVERY navigation, so the wipe is guarded by a sentinel the
        // app never touches — otherwise each page.goto() would clear the token
        // we just logged in with.
        if (!sessionStorage.getItem("__e2e_boot")) {
            sessionStorage.setItem("__e2e_boot", "1");
            localStorage.clear();
            // AuthContext.tsx:77 — without this the app auto-logs-in as the
            // compliance officer and races our explicit login.
            sessionStorage.setItem("mediverify_session_expired", "1");
        }
        // ReportsPage.tsx:405 — a real print dialog hangs a headless run.
        window.print = () => {};
    });
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
    await expect(page.locator("aside nav a").first()).toBeVisible();
}

/**
 * Navigate and prove we are still authenticated. Without the nav check a
 * logged-out shell still renders (with a placeholder identity), so every
 * "element is absent" assertion would pass vacuously.
 */
async function gotoAsUser(page: Page, route: string) {
    await page.goto(route);
    await expect(page.locator("aside nav a").first()).toBeVisible({
        timeout: 30_000,
    });
}

/** Anchor element proving the route actually rendered its own content. */
function anchorFor(page: Page, route: string) {
    switch (route) {
        case "/":
            return page.getByRole("heading", { name: "Compliance Dashboard" });
        case "/clinicians":
            return page
                .getByPlaceholder("Search by name or role...")
                .or(page.getByRole("heading").first());
        case "/documents":
            return page.getByRole("heading", {
                name: "Documents & AI Review Queue",
            });
        case "/chat":
            return page.getByRole("button", { name: "New Chat" });
        case "/reports":
            return page.getByRole("heading", { name: "Reports & Approvals" });
        case "/onboardOrg":
            return page.getByRole("heading", {
                name: "Onboard New Organization",
            });
        case "/costManagement":
            return page.getByRole("heading", { name: "Cost Management" });
        default:
            throw new Error(`no anchor for ${route}`);
    }
}

const ROUTES_FOR_NAV: Record<string, string> = {
    Dashboard: "/",
    Clinicians: "/clinicians",
    Documents: "/documents",
    "AI Chat": "/chat",
    Reports: "/reports",
    "Onboard Org": "/onboardOrg",
    "Cost Management": "/costManagement",
};

// ---------------------------------------------------------------- Test 1 + 2

for (const [role, email] of Object.entries(ACCOUNTS)) {
    test(`${role}: sidebar shows exactly its permitted nav`, async ({
        page,
    }) => {
        await login(page, email);

        // .flex-1 is the label span; the sibling spans are the icon ligature
        // and the "Admin" badge, both of which land in innerText otherwise.
        const labels = await page.locator("aside nav a span.flex-1").allInnerTexts();
        expect(labels.map((t) => t.trim())).toEqual(
            EXPECTED_NAV[role as keyof typeof ACCOUNTS],
        );

        await expect(
            page.locator("aside").getByText(role.replace(/_/g, " "), {
                exact: true,
            }),
        ).toBeVisible();
    });

    test(`${role}: every permitted page renders without a JS error`, async ({
        page,
    }, testInfo) => {
        const pageErrors: string[] = [];
        const badResponses: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(e.message));
        page.on("response", (r) => {
            if (r.status() >= 400)
                badResponses.push(`${r.status()} ${r.request().method()} ${r.url()}`);
        });

        await login(page, email);

        for (const label of EXPECTED_NAV[role as keyof typeof ACCOUNTS]) {
            const route = ROUTES_FOR_NAV[label];
            await gotoAsUser(page, route);
            await expect(anchorFor(page, route).first()).toBeVisible({
                timeout: 30_000,
            });
            await page.screenshot({
                path: testInfo.outputPath(
                    `${role}${route.replace(/\//g, "_")}.png`,
                ),
                fullPage: true,
            });
        }

        if (badResponses.length)
            testInfo.annotations.push({
                type: "http-errors",
                description: [...new Set(badResponses)].join("\n"),
            });
        expect(pageErrors, `uncaught JS errors as ${role}`).toEqual([]);
    });
}

// -------------------------------------------------------------------- Test 3

test.describe("in-page scope gating (src/auth/scopes.ts)", () => {
    test("hr: no policy tab, but the review queue is present", async ({
        page,
    }) => {
        await login(page, ACCOUNTS.hr);
        await gotoAsUser(page, "/documents");
        await expect(anchorFor(page, "/documents")).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Policy Documents" }),
        ).toHaveCount(0);
        await expect(
            page.getByRole("heading", { level: 2, name: /AI Review Queue/ }),
        ).toBeVisible();
    });

    test("clinician: neither policy tab nor review queue", async ({ page }) => {
        await login(page, ACCOUNTS.clinician);
        await gotoAsUser(page, "/documents");
        await expect(anchorFor(page, "/documents")).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Policy Documents" }),
        ).toHaveCount(0);
        await expect(
            page.getByRole("heading", { level: 2, name: /AI Review Queue/ }),
        ).toHaveCount(0);
    });

    test("compliance officer: both document tabs", async ({ page }) => {
        await login(page, ACCOUNTS.compliance_officer);
        await gotoAsUser(page, "/documents");
        await expect(
            page.getByRole("button", { name: "Credential Documents" }),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Policy Documents" }),
        ).toBeVisible();
    });

    test("clinician: no sign-off form on a pending report", async ({ page }) => {
        await login(page, ACCOUNTS.clinician);
        await gotoAsUser(page, "/reports");
        await expect(anchorFor(page, "/reports")).toBeVisible();
        await expect(
            page.getByRole("heading", { name: "Compliance Officer Sign-off" }),
        ).toHaveCount(0);
    });

    test("clinician: /onboardOrg redirects instead of rendering", async ({
        page,
    }) => {
        await login(page, ACCOUNTS.clinician);
        await page.goto("/onboardOrg");
        // Guarded: bounced to the first route this role may see.
        await page.waitForURL((u) => !u.pathname.startsWith("/onboardOrg"), {
            timeout: 30_000,
        });
        await expect(
            page.getByRole("heading", { name: "Onboard New Organization" }),
        ).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: "Switch to Super Admin" }),
        ).toHaveCount(0);
    });

    test("clinician: /costManagement redirects too", async ({ page }) => {
        await login(page, ACCOUNTS.clinician);
        await page.goto("/costManagement");
        await page.waitForURL((u) => !u.pathname.startsWith("/costManagement"), {
            timeout: 30_000,
        });
        await expect(
            page.getByRole("heading", { name: "Cost Management" }),
        ).toHaveCount(0);
    });

    test("signed out: the app shell never renders", async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.clear();
            sessionStorage.setItem("mediverify_session_expired", "1");
        });
        await page.goto("/dashboard");
        await page.waitForURL(/\/login/, { timeout: 30_000 });
        // Previously rendered a shell with a hardcoded "Sarah Chen" identity.
        await expect(page.getByText("Sarah Chen")).toHaveCount(0);
    });
});

// -------------------------------------------------------------------- Test 4

test.describe.serial("full pipeline: upload -> verify -> report -> approve", () => {
    test("compliance officer drives a credential through to a signed report", async ({
        page,
    }, testInfo) => {
        test.setTimeout(300_000);
        const shot = (n: string) =>
            page.screenshot({
                path: testInfo.outputPath(`${n}.png`),
                fullPage: true,
            });

        await login(page, ACCOUNTS.compliance_officer);

        const token = await page.evaluate(() =>
            localStorage.getItem("mediverify_token"),
        );
        const auth = { Authorization: `Bearer ${token}` };
        const listReports = async (): Promise<string[]> => {
            const res = await page.request.get(`${API}/reports`, {
                headers: auth,
            });
            const body = await res.json();
            return (body.reports || []).map((r: any) => r.id || r.report_id);
        };

        // Snapshot first — this is what keeps us off the pre-existing reports.
        const before = new Set(await listReports());

        // --- upload -------------------------------------------------------
        await gotoAsUser(page, "/documents");
        await expect(anchorFor(page, "/documents")).toBeVisible();

        const clinicianSelect = page.locator("select").first();
        await expect(clinicianSelect.locator("option").first()).not.toHaveText(
            /Loading clinicians/,
            { timeout: 30_000 },
        );
        // The roster is not just the seed — the first option is whoever sorts
        // first. Pick a nurse, or the backend rejects an RN licence for a
        // physician ("This Credential Type document is not required for ...").
        const options = await clinicianSelect
            .locator("option")
            .evaluateAll((els) =>
                els.map((e) => ({
                    value: (e as HTMLOptionElement).value,
                    label: e.textContent?.trim() ?? "",
                })),
            );
        const nameOf = (label: string) => label.split("—")[0].trim();
        const names = options.map((o) => nameOf(o.label));
        // Also avoid a name that is a prefix of another clinician's name: the
        // chat agent resolves clinicians by NAME only, so "Org 1 Nurse" is
        // ambiguous with "Org 1 Nurse Two" and it stops to ask which.
        const picked =
            options.find(
                (o) =>
                    /nurse/i.test(o.label) &&
                    !names.some(
                        (n) =>
                            n !== nameOf(o.label) &&
                            n.startsWith(nameOf(o.label)),
                    ),
            ) ?? options[0];
        const clinicianLabel = nameOf(picked.label);
        await clinicianSelect.selectOption(picked.value);

        // Credential types are re-resolved per clinician; take a required one.
        await expect(
            page.getByText(/Loading required credential types/),
        ).toHaveCount(0, { timeout: 30_000 });
        await page.locator("select").nth(1).selectOption({ index: 0 });

        await page.locator('input[type="file"]').setInputFiles({
            name: "rn_license_e2e.pdf",
            mimeType: "application/pdf",
            // Unique per run: the backend dedupes by content hash and rejects a
            // re-upload with "this file is already on record".
            buffer: Buffer.from(
                `%PDF-1.4 E2E credential document for OCR\nLicense No: RN-E2E-${Date.now()}\n`,
            ),
        });

        const uploadBtn = page.getByRole("button", { name: "Upload & Verify" });
        await expect(uploadBtn).toBeEnabled();
        await uploadBtn.click();

        // Resolve on either outcome so a backend rejection reports its own
        // message instead of timing out blind.
        const uploadOk = page.getByText(/Document uploaded successfully/);
        const uploadErr = page.getByText(
            /Failed to upload|not required for|already on record|Internal Server Error/,
        );
        await expect(uploadOk.or(uploadErr).first()).toBeVisible({
            timeout: 180_000,
        });
        await shot("1-upload-result");
        if (await uploadErr.isVisible())
            throw new Error(`upload rejected: ${await uploadErr.innerText()}`);

        // The green banner is not proof: DocumentsPage.tsx:220 renders a success
        // banner from whatever the API returned, so a pipeline that came back
        // status:"failed" (ocr:null, checks:[], credential:null) still reads as
        // "Document uploaded successfully!". Soft-assert so the rest of the
        // pipeline still runs and gets reported.
        const banner = await uploadOk.innerText();
        testInfo.annotations.push({ type: "upload-banner", description: banner });
        expect
            .soft(
                banner,
                'upload reported success but the document pipeline returned status "failed" — no OCR, no checks, no credential row, and nothing queued for human review',
            )
            .not.toMatch(/Status:\s*failed/i);
        expect
            .soft(
                banner,
                "banner reads res.document_id but /documents/upload returns `id`, so the real id is never shown and the OCR modal never auto-opens (DocumentsPage.tsx:231)",
            )
            .not.toMatch(/Document ID:\s*Processed/i);

        // --- draft a report through chat ----------------------------------
        await gotoAsUser(page, "/chat");
        await page.getByRole("button", { name: "New Chat" }).click();

        const prompt = page.getByPlaceholder(/Ask a compliance query/);
        // By name — the agent's clinician lookup does not accept an ID, despite
        // its own disambiguation message asking the user to reply with one.
        await prompt.fill(`Draft a compliance report for ${clinicianLabel}`);
        await page.getByRole("button", { name: "Send" }).click();
        await shot("2-chat-orchestrating");

        // The orchestrator writes the report server-side; polling the API is
        // the reliable completion signal (SSE may or may not surface a card).
        const deadline = Date.now() + 180_000;
        let newId: string | undefined;
        while (Date.now() < deadline && !newId) {
            newId = (await listReports()).find((id) => !before.has(id));
            if (!newId) await page.waitForTimeout(3000);
        }
        await shot("3-chat-answer");
        expect(
            newId,
            "chat did not produce a new compliance_reports row within 180s",
        ).toBeTruthy();

        // --- approve the report WE created --------------------------------
        await gotoAsUser(page, "/reports");
        await expect(anchorFor(page, "/reports")).toBeVisible();

        // ReportsPage auto-selects the first report — click ours explicitly.
        await page.getByText(`${newId!.slice(0, 8)}...`, { exact: true }).click();
        await expect(page.getByText(`Report ID: ${newId}`)).toBeVisible({
            timeout: 30_000,
        });
        await shot("4-report-drafted");

        await page
            .getByPlaceholder("Enter compliance sign-off notes (optional)...")
            .fill("Reviewed and signed off by automated E2E run.");
        await page
            .getByRole("button", { name: "Approve & Sign Report" })
            .click();

        await expect(page.getByText(/Report approved successfully/)).toBeVisible(
            { timeout: 60_000 },
        );
        // The toast fires before the list+detail refetch lands. An approved
        // report must not still offer the approval gate, and that form
        // disappearing is also the signal that the pane has settled.
        await expect(
            page.getByRole("heading", { name: /Compliance Officer Sign-off/ }),
        ).toHaveCount(0, { timeout: 60_000 });
        await expect(page.getByText(/Loading reports/)).toHaveCount(0, {
            timeout: 60_000,
        });
        await shot("5-report-approved");

        // The approval has to be legible on the document itself, not just in
        // the toast: GET /reports/{id} carries approved_by now.
        // The signature must name the person who signed, not a hardcoded role.
        await expect(
            page.getByText(/^Signed by Org 1 Compliance Officer$/),
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText("Awaiting Approval")).toHaveCount(0);

        const res = await page.request.get(`${API}/reports/${newId}`, {
            headers: auth,
        });
        expect((await res.json()).status).toBe("approved");
    });
});

// -------------------------------------------------------------------- Test 5

test("ambiguous clinician name offers candidate buttons that resolve the turn", async ({
    page,
}, testInfo) => {
    test.setTimeout(300_000);
    await login(page, ACCOUNTS.compliance_officer);
    await gotoAsUser(page, "/chat");
    await page.getByRole("button", { name: "New Chat" }).click();

    // "Org 1 Nurse" also prefix-matches "Org 1 Nurse Two", so the orchestrator
    // returns >1 candidate and asks which.
    await page
        .getByPlaceholder(/Ask a compliance query/)
        .fill("Draft a compliance report for Org 1 Nurse");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(
        page.getByText("Which one did you mean?", { exact: true }),
    ).toBeVisible({ timeout: 180_000 });
    const choices = page.locator("button", { hasText: /^Org 1 Nurse.*\(ID: / });
    expect(await choices.count()).toBeGreaterThan(1);
    await page.screenshot({
        path: testInfo.outputPath("6-candidates.png"),
        fullPage: true,
    });

    const label = (await choices.first().innerText()).trim();
    await choices.first().click();

    // The turn must actually resolve rather than ask again.
    await expect(page.getByText(/Connecting to orchestrator/)).toHaveCount(0, {
        timeout: 180_000,
    });
    await page.screenshot({
        path: testInfo.outputPath("7-candidate-resolved.png"),
        fullPage: true,
    });

    // The interrupted intent must be resumed: this was a report request, so
    // picking a candidate has to draft the report, not fall back to a
    // compliance-status read.
    await expect(page.getByText("Drafted Compliance Report")).toBeVisible({
        timeout: 180_000,
    });
    await expect(
        page.getByRole("button", { name: /Review & Sign/ }),
    ).toBeVisible();

    const transcript = await page.locator("div.flex-1.overflow-y-auto.p-6").innerText();
    // The label must appear twice — once on the button, once in the user
    // bubble — proving the transcript reads back the name, not the raw uuid.
    expect(
        transcript.split(label).length - 1,
        "user bubble should read back the candidate label, not the bare id",
    ).toBeGreaterThan(1);
    testInfo.annotations.push({
        type: "resolved-answer",
        description: transcript.slice(-600),
    });
    // The backend's own ambiguity line must appear exactly once: picking a
    // candidate resolves the name instead of asking again.
    expect(
        transcript.split("clinicians match").length - 1,
        "asked to disambiguate a second time",
    ).toBe(1);
});


// -------------------------------------------------------------------- Test 6

test("org admin may not sign off a report", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await gotoAsUser(page, "/reports");
    await expect(anchorFor(page, "/reports")).toBeVisible();

    // Land on a report still awaiting approval, then confirm no gate is offered.
    await page.getByRole("button", { name: "Pending" }).click();
    await expect(page.getByText(/Loading reports/)).toHaveCount(0, {
        timeout: 30_000,
    });
    await expect(
        page.getByRole("heading", { name: /Compliance Officer Sign-off/ }),
    ).toHaveCount(0);
    await expect(
        page.getByRole("button", { name: "Approve & Sign Report" }),
    ).toHaveCount(0);

    // And the API refuses even if the button is bypassed.
    const token = await page.evaluate(() =>
        localStorage.getItem("mediverify_token"),
    );
    const list = await page.request.get(`${API}/reports?status=pending_approval`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const pending = (await list.json()).reports || [];
    if (pending.length) {
        const res = await page.request.post(
            `${API}/reports/${pending[0].id}/approve`,
            { headers: { Authorization: `Bearer ${token}` } },
        );
        expect(res.status(), "admin must not hold compliance:approve").toBe(403);
    }
});
