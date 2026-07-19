import { expect, test, type Page } from '@playwright/test'

function statusLocator(page: Page) {
  return page.getByTestId('connection-status')
}

async function waitForConnected(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      return await statusLocator(page).innerText()
    }, { timeout: 30_000 })
    .toMatch(/Connected to host|Hosting room/i)
}

async function startHost(page: Page): Promise<string> {
  await page.goto('/#/host')
  await page.fill('#host-name', 'Host A')
  await page.getByRole('button', { name: 'Start Game' }).click()

  const joinUrl = (await page.locator('.join-url').innerText()).trim()
  await page.getByRole('button', { name: 'Continue To Game Screen' }).click()
  await expect(statusLocator(page)).toContainText(/Hosting room/i)
  return joinUrl
}

async function joinGuest(page: Page, joinUrl: string): Promise<void> {
  await page.goto(joinUrl)
  await page.fill('#player-name', 'Guest B')
  await page.getByRole('button', { name: 'Join Game' }).click()
  await waitForConnected(page)
}

test('guest reconnects after page reload', async ({ browserName, browser }) => {
  test.slow()

  const hostContext = await browser.newContext()
  const guestContext = await browser.newContext()
  const hostPage = await hostContext.newPage()
  const guestPage = await guestContext.newPage()

  const joinUrl = await startHost(hostPage)
  await joinGuest(guestPage, joinUrl)

  await guestPage.reload()
  await waitForConnected(guestPage)

  await hostContext.close()
  await guestContext.close()

  console.log(`Reconnect smoke test passed in ${browserName}`)
})

test('guest can recover after host reload', async ({ browserName, browser }) => {
  test.slow()

  const hostContext = await browser.newContext()
  const guestContext = await browser.newContext()
  const hostPage = await hostContext.newPage()
  const guestPage = await guestContext.newPage()

  const joinUrl = await startHost(hostPage)
  await joinGuest(guestPage, joinUrl)

  await hostPage.reload()

  await expect
    .poll(async () => {
      return await statusLocator(hostPage).innerText()
    }, { timeout: 40_000 })
    .toMatch(/Hosting room|Rebinding room|Starting host session/i)

  const guestStatus = await statusLocator(guestPage).innerText()
  if (!/Connected to host/i.test(guestStatus)) {
    await guestPage.getByTestId('reconnect-button').click()
  }

  await waitForConnected(guestPage)

  await hostContext.close()
  await guestContext.close()

  console.log(`Host-reload recover test passed in ${browserName}`)
})
