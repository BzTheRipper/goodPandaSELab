import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5173' });

test.describe('Critical order path', () => {
  test('place → accept → prepare → drone → hub → collect', async ({ page, context }) => {
    // Seeded credentials:
    //   customer@goodpanda.test / customer123
    //   owner1@goodpanda.test / owner123
    //   hub@goodpanda.test / hub123

    // ---------- Login as customer ----------
    await page.goto('/login');
    await page.fill('input[type="email"]', 'customer@goodpanda.test');
    await page.fill('input[type="password"]', 'customer123');
    await page.click('button:has-text("Log in")');
    await page.waitForURL('/');

    // ---------- Place an order ----------
    await page.click('text="Panda Biryani House"');
    await page.waitForURL('**/restaurants/*');
    await page.click('button:has-text("Add"), button:has-text("+")');
    await page.click('a:has-text("Cart")');
    await page.click('button[type="submit"]:has-text("Place order")');

    await page.waitForURL('/checkout');
    await page.selectOption('select[name="hub"]', { index: 0 });
    await page.click('button[type="submit"]:has-text("Place order")');

    await page.waitForURL('/orders/*');
    const orderUrl = page.url();

    // ---------- Login as owner in a new context ----------
    const ownerPage = await context.newPage();
    await ownerPage.goto('/login');
    await ownerPage.fill('input[type="email"]', 'owner1@goodpanda.test');
    await ownerPage.fill('input[type="password"]', 'owner123');
    await ownerPage.click('button:has-text("Log in")');
    await ownerPage.waitForURL('/owner/orders');

    // Accept → prepare → ready
    await ownerPage.click(`a[href="${orderUrl}"]`);
    await ownerPage.click('button:has-text("Accept")');
    await ownerPage.click('button:has-text("Preparing")');
    await ownerPage.click('button:has-text("Ready")');

    // ---------- Dispatch ----------
    await ownerPage.click('button:has-text("Load drone")');
    await ownerPage.waitForTimeout(500);
    await ownerPage.click('button:has-text("Dispatch")');

    // ---------- Login as hub operator ----------
    const hubPage = await context.newPage();
    await hubPage.goto('/login');
    await hubPage.fill('input[type="email"]', 'hub@goodpanda.test');
    await hubPage.fill('input[type="password"]', 'hub123');
    await hubPage.click('button:has-text("Log in")');
    await hubPage.waitForURL('/hub');

    // Verify pickup - get code from order page
    await hubPage.click('a:has-text("Verify"), text="Verify pickup"');
    await page.goto(orderUrl);
    const codeText = await page.locator('text=/\\d{6}/').first().textContent();
    await hubPage.fill('input[name="pickupCode"]', codeText.replace(/\D/g, ''));
    await hubPage.click('button:has-text("Verify & collect")');

    await hubPage.waitForURL('**/hub**');
    await expect(hubPage.locator('text="Order collected"')).toBeVisible();
  });
});
