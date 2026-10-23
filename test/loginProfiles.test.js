import test from 'node:test'
import assert from 'node:assert/strict'

import { findSelectedProfile, normalizeProfiles, profileId, removeProfile, upsertProfile } from '../utils/loginProfiles.js'

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
      id: profileId(first),
      host: 'mud.example.com',
      port: '4057',
      account: 'hero5',
      password: 'secret',
      captcha: '_5',
      encoding: 'gbk',
      updatedAt: 0
    }
  )
})

test('normalizeProfiles keeps UTF-8 choice and defaults old profiles to GBK', () => {
  const [utf8] = normalizeProfiles([{ ...first, encoding: 'UTF8' }])
  const [legacy] = normalizeProfiles([first])
  assert.equal(utf8.encoding, 'utf-8')
  assert.equal(legacy.encoding, 'gbk')
})

test('upsertProfile persists the account encoding', () => {
  const [profile] = upsertProfile([], { ...first, encoding: 'utf-8' })
  assert.equal(profile.encoding, 'utf-8')
})

test('upsertProfile updates and moves an existing login to the front', () => {
  const other = { ...first, account: 'other5', password: 'old' }
  const profiles = upsertProfile(upsertProfile([], other), { ...first, password: 'new' })
  const updated = upsertProfile(profiles, other)
  assert.equal(updated.length, 2)
  assert.equal(updated[0].id, profileId(other))
  assert.equal(updated[0].password, 'old')
})

test('all login parameters participate in the stable hash, excluding record metadata', () => {
  const baseId = profileId(first)
  assert.match(baseId, /^[a-f0-9]{32}$/)
  assert.equal(profileId({ ...first, id: 'legacy', updatedAt: 123, encoding: 'GBK' }), baseId)
  assert.equal(profileId({ ...first, host: first.host.trim(), captcha: '_5' }), baseId)
  assert.equal(profileId({ ...first, encoding: 'UTF8' }), profileId({ ...first, encoding: 'utf-8' }))
  for (const [key, value] of Object.entries({ host: 'other.example.com', port: '4058', account: 'other', password: 'secret ', captcha: '_6', encoding: 'utf-8' })) {
    assert.notEqual(profileId({ ...first, [key]: value }), baseId, key)
  }
})

test('same account with different suffixes or other login parameters saves separate records', () => {
  const variants = [first, { ...first, captcha: '_6' }, { ...first, password: 'changed' }, { ...first, encoding: 'utf-8' }]
  const profiles = variants.reduce(upsertProfile, [])
  assert.equal(profiles.length, variants.length)
  assert.equal(upsertProfile(profiles, first).length, variants.length)
  assert.equal(removeProfile(profiles, profileId(first)).length, variants.length - 1)
})

test('saving and reloading more than eight profiles preserves all records', () => {
  const profiles = Array.from({ length: 20 }, (_, index) => ({ ...first, captcha: '_' + index }))
    .reduce(upsertProfile, [])
  assert.equal(profiles.length, 20)
  assert.equal(normalizeProfiles(JSON.parse(JSON.stringify(profiles))).length, 20)
})

test('legacy records receive new hashes and keep the previously selected account', () => {
  const legacyId = 'mud.example.com:4057|hero5'
  const profiles = normalizeProfiles([
    { ...first, account: 'newer', updatedAt: 2 },
    { ...first, id: legacyId, updatedAt: 1 }
  ])
  assert.equal(findSelectedProfile(profiles, legacyId).id, profileId(first))
  assert.equal(findSelectedProfile(profiles, profileId(first)).account, 'hero5')
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
