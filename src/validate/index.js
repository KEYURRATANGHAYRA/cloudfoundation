const chk = require('chalk')
const fs = require('fs-extra')
const path = require('path')
const glob = require('glob')
const jshint = require('jshint').JSHINT

const { DESCRIPTION_ERROR_MSG } = require('../utils/constants')

const {
  configAWS,
  log,
  getTemplateFiles,
  getTemplateAsObject,
  getCfnPropType,
  inquireTemplateName,
} = require('../utils')

const jshintOpts = {
  asi: true,
  esversion: 6,
  node: true,
}

module.exports = async function validate (env) {
  let aws
  let templateFiles
  let errors
  let name = env

  if (!name) {
    try {
      name = await inquireTemplateName()
    } catch (error) {
      return log.e(error.message)
    }
  }

  try {
    aws = configAWS()
    templateFiles = getTemplateFiles(name)
    errors = []

    // validate each file individually for better error reports
    templateFiles.forEach((sf) => {
      const isDir = fs.lstatSync(sf).isDirectory()
      const cfnProp = getCfnPropType(sf)

      if (!isDir) {
        try {
          const j = fs.readFileSync(path.resolve(sf), 'utf8')

          jshint(j, jshintOpts)

          if (jshint.errors.length > 0) errors.push({ file: sf, errors: jshint.errors })
        } catch (error) {
          throw error
        }
      } else {
        if (cfnProp === 'Description') throw new Error(DESCRIPTION_ERROR_MSG)

        glob.sync(`${sf}/**/*.+(js|json)`).forEach((f) => {
          try {
            const j = fs.readFileSync(path.resolve(f), 'utf8')

            jshint(j, jshintOpts)

            if (jshint.errors.length > 0) errors.push({ file: f, errors: jshint.errors })
          } catch (error) {
            throw error
          }
        })
      }
    })
  } catch (error) {
    return log.e(error.message)
  }

  let ecount = 0

  errors.forEach((e) => {
    log.p(chk.underline.whiteBright(`\nErrors found in ./src${e.file.split('src')[1]}\n`))

    e.errors.forEach((e) => {
      log.p(`  Line ${e.line} - ${e.reason}`)
    })

    log.p()

    ecount += e.errors.length
  })

  if (errors.length > 0) {
    return log.e(chk.red(`${ecount} syntax errors found across ${errors.length} files.  Please fix before continuing.\n`))
  }

  log.p()
  log.s(chk.green(`No syntax errors found across ${templateFiles.length} files for ${chk.cyan(name)} template!\n`))
  log.i('Beginning Cloudformation Template Validation...\n')

  // DONE: if at this point, we then everything is good to go
  // we need to..
  // a) check if src/ even has any damn folders
  // b) check if they've passed a valid name of a template and look for it
  // c) if they didn't pass anything, grab all the dirs, and show them as options
  // d) when either (b) or (c) succeed, begin looping through every json file
  // e) if any file fails, break out of the loop, and show them the failure

  let templateObject

  try {
    templateObject = getTemplateAsObject(name)
  } catch (error) {
    return log.e(error.message)
  }

  const cfn = new aws.CloudFormation()

  return cfn.validateTemplate({ TemplateBody: JSON.stringify(templateObject) }, (err, data) => {
    if (err) {
      log.e(`${chk.red('CloudFormation Validation error for template')} ${chk.cyan(name)}:\n`)
      return log.m(`${err.message}\n`)
    }

    log.s(chk.green('No CloudFormation Template Errors found!\n'))
    return log.i('Reminder - the validate-template API will not catch every error.  Some can only be found by deploying the full template.\n')
  })

  // DONE: after that we'll need to loop through and validate each template..
  // a) create a .tmp/ folder
  // b) call the build function down on just that one template (Which highlights the need for an individual build function)
  // c) put the build template in .tmp/
  // d) call the SDK validate template function on the template.
  // e) either return the errors, or return a success message!
  // IMPORTANT: I need to tell them that the damn user they're using needs access to that function of cloudformation

  // DONE: we just need to bring in inquirer JS and, if they don't supply a template
  // let them choose one and execute based on that.  This is eligible for helper function since
  // it's going to be used in Deploy and Update as well.
}
