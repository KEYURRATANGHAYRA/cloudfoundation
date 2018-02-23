const fs = require('fs-extra')
const chk = require('chalk')
const inq = require('inquirer')
const utils = require('../utils')

const stackUtils = require('../utils/stacks')
const profileUtils = require('../profiles/utils.js')
const awsUtils = require('../utils/aws.js')

exports.describeAll = async function describeAll (env, opts = {}) {
  const cwd = process.cwd()
  const templateName = await utils.getValidTemplateName(env)
  let profile = opts.profile
  let region = opts.region

  const rc = fs.readJsonSync(`${cwd}/.cfdnrc`)

  rc.templates = rc.templates || {}

  const stacks = rc.templates[templateName] && Object.entries(rc.templates[templateName])

  if (!stacks || !stacks.length) throw new Error(`No stacks for ${templateName} found.`)

  const validProfiles = stacks.reduce((profiles, [, stack]) => {
    if (!profiles.find(p => p === stack.profile)) profiles.push(stack.profile)
    return profiles
  }, [])

  if (profile && !validProfiles.find(p => p === profile)) {
    throw new Error(`${chk.cyan(profile)} is not used for any of ${chk.cyan(templateName)}'s stacks.`)
  } else if (!profile) {
    profile = await inq.prompt({
      type: 'list',
      message: 'Which profile\'s stacks would you like to describe?',
      name: 'use',
      choices: validProfiles,
    })

    if (profile.use) profile = profile.use
  }

  const profileStacks = stacks.filter(([, s]) => s.profile === profile)

  const validRegions = stacks.reduce((regions, [, stack]) => {
    if (profileStacks.find(([, ps]) => ps.profile === stack.profile)) {
      if (!regions.find(r => r === stack.region)) regions.push(stack.region)
    }
    return regions
  }, []).sort()

  if (!validRegions.length) return utils.log.e(`No stacks found for Profile ${chk.cyan(profile)}`, 2)

  if (region && !validRegions.find(r => r === region)) {
    throw new Error(`${chk.cyan(region)} is not used for any of ${chk.cyan(profile)}'s stacks.`)
  } else if (!region) {
    region = await inq.prompt({
      type: 'list',
      message: 'Which region\'s stacks would you like to describe?',
      name: 'use',
      choices: validRegions,
    })

    if (region.use) region = region.use
  }

  profile = profileUtils.getFromAllProfiles(profile)

  const aws = awsUtils.configAWS(profile)
  const cfn = new aws.CloudFormation({ region })

  utils.log.i('fetching stacks...')

  const { Stacks } = await cfn.describeStacks().promise()

  if (!Stacks.length) {
    return utils.log.i(`No stacks found for Template ${chk.cyan(templateName)} for Profile ${chk.cyan(profile.name)} in Region ${chk.cyan(region)}`, 2)
  }

  let info = `
Stacks for Template ${chk.cyan(templateName)} for Profile ${chk.cyan(profile.name)} in Region ${chk.cyan(region)}

${chk.cyan('Name')}, Created, Status, Description
----------------------------------`

  Stacks.forEach((s) => {
    info += `
${chk.cyan(s.StackName)}, ${new Date(s.CreationTime).toLocaleString()}, ${s.StackStatus}, ${s.Description}
`
  })

  return utils.log.p(info)
}

exports.describe = async function describe (env, opts) {
  const cwd = process.cwd()
  const {
    status,
    parameters,
    outputs,
    tags,
    info,
  } = opts

  let templateName = env && utils.checkValidTemplate(env)
  let columns

  if (status || parameters || outputs || tags || info) {
    columns = {
      status,
      parameters,
      outputs,
      tags,
      info,
    }
  }

  if (!templateName) templateName = await utils.inquireTemplateName('Which template has the stack you want to update?')

  const rc = fs.readJsonSync(`${cwd}/.cfdnrc`)

  rc.templates = rc.templates || {}

  const stacks = rc.templates[templateName]

  if (!stacks) throw new Error(`No stacks for ${templateName} found.`)

  const stackName = opts && opts.stackname
    ? opts.stackname
    : await stackUtils.selectStackName(templateName, stacks)

  const stack = stacks[stackName]

  if (!stack) return utils.log.e(`Stack ${stackName} not found.`, 2)

  const region = stack.region

  const profile = profileUtils.getFromAllProfiles(stack.profile)
  const aws = awsUtils.configAWS(profile)

  const cfn = new aws.CloudFormation({ region })

  utils.log.i('Fetching stack info...', 2)

  const { Stacks } = await cfn.describeStacks({ StackName: stackName }).promise()

  return stackUtils.displayStack(Stacks[0], columns)
}
