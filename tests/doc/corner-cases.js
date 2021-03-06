import fs from 'fs'
import path from 'path'
import YAML from '../../src/index'

test('eemeli/yaml#2', () => {
  const src = `
aliases:
  - docker:
      - image: circleci/node:8.11.2
  - key: repository-{{ .Revision }}\n`
  expect(YAML.parse(src)).toMatchObject({
    aliases: [
      { docker: [{ image: 'circleci/node:8.11.2' }] },
      { key: 'repository-{{ .Revision }}' }
    ]
  })
})

test('eemeli/yaml#3', () => {
  const src = '{ ? : 123 }'
  const doc = YAML.parseDocument(src)
  expect(doc.errors).toHaveLength(0)
  expect(doc.contents.items[0].key).toBeNull()
  expect(doc.contents.items[0].value.value).toBe(123)
})

describe('eemeli/yaml#10', () => {
  test('reported', () => {
    const src = `
aliases:
  - restore_cache:
      - v1-yarn-cache
  - save_cache:
      paths:
        - ~/.cache/yarn
  - &restore_deps_cache
    keys:
      - v1-deps-cache-{{ checksum "yarn.lock" }}\n`
    const docs = YAML.parseAllDocuments(src)
    expect(docs).toHaveLength(1)
    expect(docs[0].errors).toHaveLength(0)
  })

  test('complete file', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../artifacts/prettier-circleci-config.yml'),
      'utf8'
    )
    const doc = YAML.parseDocument(src)
    expect(doc.toJSON()).toMatchObject({
      aliases: [
        { restore_cache: { keys: ['v1-yarn-cache'] } },
        { save_cache: { key: 'v1-yarn-cache', paths: ['~/.cache/yarn'] } },
        {
          restore_cache: { keys: ['v1-deps-cache-{{ checksum "yarn.lock" }}'] }
        },
        {
          save_cache: {
            key: 'v1-yarn-deps-{{ checksum "yarn.lock" }}',
            paths: ['node_modules']
          }
        },
        {
          docker: [{ image: 'circleci/node:9' }],
          working_directory: '~/prettier'
        }
      ],
      jobs: {
        build_prod: {
          '<<': {
            docker: [{ image: 'circleci/node:9' }],
            working_directory: '~/prettier'
          },
          environment: { NODE_ENV: 'production' },
          steps: [
            { attach_workspace: { at: '~/prettier' } },
            { run: 'yarn build' },
            { persist_to_workspace: { paths: ['dist'], root: '.' } },
            { store_artifacts: { path: '~/prettier/dist' } }
          ]
        },
        checkout_code: {
          '<<': {
            docker: [{ image: 'circleci/node:9' }],
            working_directory: '~/prettier'
          },
          steps: [
            'checkout',
            { restore_cache: { keys: ['v1-yarn-cache'] } },
            {
              restore_cache: {
                keys: ['v1-deps-cache-{{ checksum "yarn.lock" }}']
              }
            },
            { run: 'yarn install' },
            { run: 'yarn check-deps' },
            {
              save_cache: {
                key: 'v1-yarn-deps-{{ checksum "yarn.lock" }}',
                paths: ['node_modules']
              }
            },
            { save_cache: { key: 'v1-yarn-cache', paths: ['~/.cache/yarn'] } },
            { persist_to_workspace: { paths: ['.'], root: '.' } }
          ]
        },
        test_prod_node4: {
          '<<': {
            docker: [{ image: 'circleci/node:9' }],
            working_directory: '~/prettier'
          },
          docker: [{ image: 'circleci/node:4' }],
          steps: [
            { attach_workspace: { at: '~/prettier' } },
            { run: 'yarn test:dist' }
          ]
        },
        test_prod_node9: {
          '<<': {
            docker: [{ image: 'circleci/node:9' }],
            working_directory: '~/prettier'
          },
          steps: [
            { attach_workspace: { at: '~/prettier' } },
            { run: 'yarn test:dist' }
          ]
        }
      },
      version: 2,
      workflows: {
        prod: {
          jobs: [
            'checkout_code',
            { build_prod: { requires: ['checkout_code'] } },
            { test_prod_node4: { requires: ['build_prod'] } },
            { test_prod_node9: { requires: ['build_prod'] } }
          ]
        },
        version: 2
      }
    })
    expect(String(doc)).toBe(src)
  })

  test('minimal', () => {
    const src = `
  - a
  - b:
    - c
  - d`
    const docs = YAML.parseAllDocuments(src)
    expect(docs[0].errors).toHaveLength(0)
    expect(docs[0].toJSON()).toMatchObject(['a', { b: ['c'] }, 'd'])
  })
})

describe('eemeli/yaml#l19', () => {
  test('map', () => {
    const src = 'a:\n  # 123'
    const doc = YAML.parseDocument(src)
    expect(String(doc)).toBe('a: null # 123\n')
  })

  test('seq', () => {
    const src = '- a: # 123'
    const doc = YAML.parseDocument(src)
    expect(String(doc)).toBe('- ? a # 123\n')
  })
})

test('eemeli/yaml#32', () => {
  expect(YAML.parse('[ ? ]')).toEqual([{ '': null }])
  expect(YAML.parse('[? 123]')).toEqual([{ 123: null }])
  expect(YAML.parse('[ 123, ? ]')).toEqual([123, { '': null }])
  expect(YAML.parse('[ 123, ? 456 ]')).toEqual([123, { 456: null }])
})

test('eemeli/yaml#34', () => {
  expect(YAML.parse('|')).toEqual('')
})

test('eemeli/yaml#36', () => {
  expect(() => YAML.parse(`{ x: ${'x'.repeat(1024)} }`)).not.toThrowError()
})

test('eemeli/yaml#38', () => {
  const src = `
  content:
    arrayOfArray:
    -
      - first: John
        last: Black
      - first: Brian
        last: Green
    -
      - first: Mark
        last: Orange
    -
      - first: Adam
        last: Grey
  `
  expect(YAML.parse(src)).toEqual({
    content: {
      arrayOfArray: [
        [{ first: 'John', last: 'Black' }, { first: 'Brian', last: 'Green' }],
        [{ first: 'Mark', last: 'Orange' }],
        [{ first: 'Adam', last: 'Grey' }]
      ]
    }
  })
})

test('fake node should respect setOrigRanges()', () => {
  const cst = YAML.parseCST('a:\r\n  # 123')
  expect(cst.setOrigRanges()).toBe(true)
  const ast = cst.map(doc =>
    new YAML.Document({ keepCstNodes: true }).parse(doc)
  )
  const fakePlain = ast[0].contents.items[0].value.cstNode
  expect(fakePlain.range).toEqual({
    start: 2,
    end: 2,
    origStart: 2,
    origEnd: 2
  })
})

test('parse an empty string as null', () => {
  const value = YAML.parse('')
  expect(value).toBeNull()
})

test('fail on map value indented with tab', () => {
  const src = 'a:\n\t1\nb:\n\t2\n'
  const doc = YAML.parseDocument(src)
  expect(doc.errors).toMatchObject([
    { name: 'YAMLSemanticError' },
    { name: 'YAMLSemanticError' }
  ])
})

test('comment on single-line value in flow map', () => {
  const src = '{a: 1 #c\n}'
  const doc = YAML.parseDocument(src)
  expect(String(doc)).toBe('{\n  a: 1 #c\n}\n')
})

describe('maps with no values', () => {
  test('block map', () => {
    const src = `a: null\n? b #c`
    const doc = YAML.parseDocument(src)
    expect(String(doc)).toBe(`? a\n? b #c\n`)
    doc.contents.items[1].value = 'x'
    expect(String(doc)).toBe(`a: null\n? b #c\n: x\n`)
  })

  test('flow map', () => {
    const src = `{\na: null,\n? b\n}`
    const doc = YAML.parseDocument(src)
    expect(String(doc)).toBe(`{ a, b }\n`)
    doc.contents.items[1].comment = 'c'
    expect(String(doc)).toBe(`{\n  a,\n  b #c\n}\n`)
    doc.contents.items[1].value = 'x'
    expect(String(doc)).toBe(`{\n  a: null,\n  b: #c\n    x\n}\n`)
  })
})
