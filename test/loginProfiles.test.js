import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeProfiles, profileId, removeProfile, upsertProfile } from '../utils/loginProfiles.js'

const first = {
  host: ' mud.example.com ',
  port: '4057',
  account: ' hero5 ',
  password: 'secret',
  captcha: ' _5 '
}

test('upsertProfile saves a normalized successful login', () => {
  const profiles = upsertProfile([], first)
  assert.equal(profiles.length, 1)
  assert.deepEqual(
    { ...profiles[0], updatedAt: 0 },
    {
      id: 'mud.example.com:4057|hero5',
      host: 'mud.example.com',
      port: '4057',
      account: 'hero5',
      password: 'secret',
      captcha: '_5',
      updatedAt: 0
    }
  )
})

test('upsertProfile updates and moves an existing login to the front', () => {
  const other = { ...first, account: 'other5', password: 'old' }
  const profiles = upsertProfile(upsertProfile([], other), { ...first, password: 'new' })
  const updated = upsertProfile(profiles, { ...other, password: 'newer' })
  assert.equal(updated.length, 2)
  assert.equal(updated[0].id, profileId(other))
  assert.equal(updated[0].password, 'newer')
})

test('normalizeProfiles rejects incomplete data and removeProfile removes only the target', () => {
  const profiles = normalizeProfiles([
    { ...first, updatedAt: 2 },
    { ...first, account: '', updatedAt: 3 },
    { ...first, account: 'other5', updatedAt: 1 }
  ])
  assert.equal(profiles.length, 2)
  assert.deepEqual(removeProfile(profiles, profileId(first)).map((item) => item.account), ['other5'])
})
