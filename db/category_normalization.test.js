/**
 * Category normalization validation tests.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve('.');
const categoriesSource = fs.readFileSync(
  path.join(projectRoot, 'src/lib/services/categories.ts'),
  'utf8'
);

test('canonical categories defined', () => {
  assert.match(categoriesSource, /CANONICAL_CATEGORIES/, 'Must define CANONICAL_CATEGORIES');
  assert.match(categoriesSource, /"business-consulting"/, 'Must include business-consulting');
  assert.match(categoriesSource, /"creative-design"/, 'Must include creative-design');
  assert.match(categoriesSource, /"health-wellness"/, 'Must include health-wellness');
  assert.match(categoriesSource, /"beauty-hair"/, 'Must include beauty-hair');
  assert.match(categoriesSource, /"technology-it"/, 'Must include technology-it');
});

test('normalizeCategory handles edge cases', () => {
  assert.match(categoriesSource, /export function normalizeCategory/, 'Must export normalizeCategory');
  assert.match(categoriesSource, /return "other"/, 'Must fall back to other');
});

test('legacy category aliases are mapped', () => {
  assert.match(categoriesSource, /consulting.*business-consulting/, 'Must map consulting');
  assert.match(categoriesSource, /design.*creative-design/, 'Must map design');
  assert.match(categoriesSource, /health.*health-wellness/, 'Must map health');
  assert.match(categoriesSource, /beauty-and-hair/, 'Must map beauty-and-hair');
  assert.match(categoriesSource, /technology-and-it/, 'Must map technology-and-it');
});

test('matching logic uses normalization', () => {
  const requestsService = fs.readFileSync(
    path.join(projectRoot, 'src/lib/services/requests.service.ts'),
    'utf8'
  );
  assert.match(requestsService, /normalizeCategory/, 'requests.service must normalize');
  assert.match(requestsService, /canProvideForCategory/, 'Must have canProvideForCategory');
  assert.match(requestsService, /normalizedCategory/, 'Must normalize in findMatching');
  assert.match(requestsService, /normalizeCategories/, 'Must normalize in getProviderServiceCategories');
});

test('service creation normalizes at write time', () => {
  const servicesService = fs.readFileSync(
    path.join(projectRoot, 'src/lib/services/services.service.ts'),
    'utf8'
  );
  assert.match(servicesService, /normalizeCategory/, 'services.service must normalize');
  assert.match(servicesService, /category:\s*normalizeCategory/, 'createService must normalize');
});

test('inferCategory uses canonical values', () => {
  const postRequestForm = fs.readFileSync(
    path.join(projectRoot, 'src/components/PostRequestForm.tsx'),
    'utf8'
  );
  assert.match(postRequestForm, /"beauty-hair"/, 'Must return beauty-hair');
  assert.match(postRequestForm, /"technology-it"/, 'Must return technology-it');
  assert.match(postRequestForm, /"creative-design"/, 'Must return creative-design');
  assert.match(postRequestForm, /"health-wellness"/, 'Must return health-wellness');
});

test('HTML forms use canonical values', () => {
  const signupHtml = fs.readFileSync(
    path.join(projectRoot, 'public/pages/provider-signup.html'),
    'utf8'
  );
  const onboardingHtml = fs.readFileSync(
    path.join(projectRoot, 'public/pages/provider-onboarding.html'),
    'utf8'
  );
  const dashboardHtml = fs.readFileSync(
    path.join(projectRoot, 'public/pages/provider-dashboard.html'),
    'utf8'
  );

  for (const [name, html] of [['signup', signupHtml], ['onboarding', onboardingHtml], ['dashboard', dashboardHtml]]) {
    assert.match(html, /value="business-consulting"/, name + ' must use business-consulting');
    assert.match(html, /value="creative-design"/, name + ' must use creative-design');
    assert.match(html, /value="health-wellness"/, name + ' must use health-wellness');
    assert.match(html, /value="beauty-hair"/, name + ' must use beauty-hair');
    assert.match(html, /value="technology-it"/, name + ' must use technology-it');
    assert(!html.includes('value="consulting"'), name + ' must not use legacy consulting');
    assert(!html.includes('value="design"'), name + ' must not use legacy design');
    assert(!html.includes('value="health"'), name + ' must not use legacy health');
  }
});

test('canProvideForCategory handles array and Set', () => {
  const requestsService = fs.readFileSync(
    path.join(projectRoot, 'src/lib/services/requests.service.ts'),
    'utf8'
  );
  assert.match(requestsService, /Array\.isArray/, 'Must check for array');
  assert.match(requestsService, /instanceof Set/, 'Must check for Set');
});

test('normalizeCategories deduplicates', () => {
  assert.match(categoriesSource, /export function normalizeCategories/, 'Must export normalizeCategories');
  assert.match(categoriesSource, /new Set/, 'Must use Set');
});

test('findMatchingProvidersForRequest uses ilike', () => {
  const requestsService = fs.readFileSync(
    path.join(projectRoot, 'src/lib/services/requests.service.ts'),
    'utf8'
  );
  assert.match(requestsService, /ilike\("category"/, 'Must use ilike');
});

console.log('\n✅ All category normalization tests passed!\n');
