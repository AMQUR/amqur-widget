import { test, expect } from "@playwright/test";

const api = process.env.LOCAL_API_URL ?? "http://127.0.0.1:3001";
const loopback = (value: string) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname);
const rooftops = [
  ["dial-chevy-of-chicago", "Dial Chevy of Chicago"],
  ["dial-nissan-of-chicago", "Dial Nissan of Chicago"],
  ["infiniti-of-chicago", "INFINITI of Chicago"],
  ["dial-cdjr-of-chicago", "Dial Chrysler Dodge Jeep Ram"],
  ["jeep-of-chicago", "Jeep of Chicago"],
] as const;

test.skip(process.env.AMQUR_E2E_ROOFTOPS !== "1", "requires the local five-rooftop seed");

for (const [tenantSlug, storeName] of rooftops) {
  test(`${storeName}: reserved test lead and demo booking stay with this rooftop`, async ({ page, baseURL }, info) => {
    if (!baseURL || ![baseURL, api].every(loopback)) throw new Error("The synthetic rooftop journey requires loopback origins");
    await page.context().route("**/*", (route) => loopback(route.request().url()) ? route.continue() : route.abort());
    await page.goto(`/?rooftop=${tenantSlug}`);
    await page.getByRole("button", { name: "Open assistant" }).click({ timeout: 10_000 });
    const input = page.getByRole("textbox", { name: /ask about vehicles/i });
    await input.fill("Show me your inventory");
    await input.press("Enter");
    const vehicles = page.getByRole("region", { name: /vehicles/ });
    await expect(vehicles).toBeVisible();
    const stores = await vehicles.locator(".amq-vcard__store").allTextContents();
    expect(stores.length).toBeGreaterThan(0);
    expect(stores.every((label) => label.includes(storeName))).toBe(true);

    const vehicle = vehicles.getByRole("article").first();
    await vehicle.scrollIntoViewIfNeeded();
    await vehicle.getByRole("button", { name: "More actions" }).click();
    await vehicle.getByRole("button", { name: "Test drive" }).click();
    const form = page.getByRole("form");
    await expect(form).toContainText(storeName);
    await form.getByLabel("First name").fill("Synthetic");
    await form.getByLabel("Last name").fill("Browser");
    await form.getByRole("textbox", { name: "Email" }).fill(`${tenantSlug}-${info.project.name}@example.invalid`);
    await form.getByRole("checkbox").first().check();
    await form.getByRole("button", { name: "Send to the team" }).click();

    await page.getByRole("button", { name: "Choose a time" }).last().click();
    const picker = page.getByRole("dialog", { name: "Choose a time" });
    const days = picker.getByRole("group", { name: "Day" }).getByRole("button");
    await days.nth(info.project.name === "mobile-390" ? 2 : 1).click();
    await picker.getByRole("group", { name: "Time" }).getByRole("button").first().click();
    await picker.getByRole("button", { name: "Book this time" }).click();
    const receipt = page.getByRole("status", { name: "Appointment confirmed" });
    await expect(receipt).toContainText(storeName);
    await expect(receipt.getByText(/^SBX-/)).toBeVisible();
    await expect(receipt.getByText(/Demo scheduler/)).toBeVisible();
  });
}
