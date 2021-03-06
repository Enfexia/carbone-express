const bytes = require("bytes");
const fs = require("fs");
const Problem = require("api-problem");
const telejson = require("telejson");
const tmp = require("tmp");
const validator = require("validator");

const fileTypes = require("@enfexia/carbone-render").fileTypes;

const handleValidationErrors = (res, next, errors) => {
  if (errors && errors.length) {
    return new Problem(422, {
      detail: "Validation failed",
      errors: errors,
    }).send(res);
  }
  next();
};

const validatorUtils = {
  /** @function isInt */
  isInt: (x) => {
    if (isNaN(x)) {
      return false;
    }
    const num = parseFloat(x);
    // use modulus to determine if it is an int
    return num % 1 === 0;
  },

  /** @function isString */
  isString: (x) => {
    return Object.prototype.toString.call(x) === "[object String]";
  },

  /** @function isNonEmptyString */
  isNonEmptyString: (x) => {
    return (
      validatorUtils.isString(x) &&
      !validator.isEmpty(x, { ignore_whitespace: true })
    );
  },

  /** @function isObject */
  isObject: (x) => {
    return Object.prototype.toString.call(x) === "[object Object]";
  },
};

const models = {
  carbone: {
    // data must be an object or array
    data: (value) => {
      return (
        value &&
        ((Array.isArray(value) && value.length) ||
          validatorUtils.isObject(value))
      );
    },

    // options is optional, but must be an object.
    options: (value) => {
      if (value) {
        return validatorUtils.isObject(value);
      }
      return true;
    },

    // formatters is optional, but must be an string
    formatters: (value) => {
      if (value) {
        return validatorUtils.isNonEmptyString(value);
      }
      return true;
    },

    // convertTo is an optional option, but must be a string and valid file type
    convertTo: (value) => {
      if (value) {
        return (
          validatorUtils.isNonEmptyString(value) &&
          (value.toLowerCase() === "pdf" || value.toLowerCase() in fileTypes)
        );
      }
      return true;
    },

    // reportName is an optional option, but must be a string
    reportName: (value) => {
      if (value) {
        return validatorUtils.isNonEmptyString(value);
      }
      return true;
    },
  },

  template: (value) => {
    return value && value != null && validatorUtils.isObject(value);
  },

  templateContent: {
    mandatory: (value) => {
      return (
        validatorUtils.isNonEmptyString(value["content"]) &&
        validatorUtils.isNonEmptyString(value["encodingType"]) &&
        validatorUtils.isNonEmptyString(value["fileType"])
      );
    },

    /** @function content is required */
    content: (value) => {
      return validatorUtils.isNonEmptyString(value);
    },

    /** @function encodingType must be in a set list */
    encodingType: (value) => {
      if (value) {
        return (
          validatorUtils.isNonEmptyString(value) &&
          validator.isIn(value, ["base64", "binary", "hex"])
        );
      }
      return true;
    },

    /** @function fileType is required and exists as a valid input file type defined in the fileTypes Dictionary */
    fileType: (value) => {
      return (
        validatorUtils.isNonEmptyString(value) &&
        value.toLowerCase() in fileTypes
      );
    },

    /** @function size size must be within limit */
    size: async (content, encoding, limit) => {
      if (
        !(
          models.templateContent.content(content) &&
          models.templateContent.encodingType(encoding)
        )
      ) {
        return false;
      }

      let attachmentLimit = bytes.parse(limit);
      if (!attachmentLimit || isNaN(attachmentLimit) || attachmentLimit < 1) {
        return false;
      }

      // ok, looks like all incoming parameters are ok, check the size
      // write out temp file, if size is ok then return true...
      let tmpFile = undefined;

      try {
        tmpFile = tmp.fileSync();
        await fs.promises.writeFile(
          tmpFile.name,
          Buffer.from(content, encoding)
        );
        // get the written file size
        const stats = fs.statSync(tmpFile.name);
        return stats.size <= attachmentLimit;
      } catch (e) {
        // something wrong (disk i/o?), cannot verify file size
        console.log(`Error validating file size. ${e.message}`);
        return false;
      } finally {
        // delete tmp file
        if (tmpFile) tmpFile.removeCallback();
      }
    },

    /** @function fileConversion input/output file types must exist in fileType conversion dictionary */
    fileConversion: (contentFileType, outputFileType) => {
      if (contentFileType == "") {
        return false;
      }
      if (contentFileType && outputFileType) {
        return (
          fileTypes[contentFileType.toLowerCase()] &&
          fileTypes[contentFileType.toLowerCase()].includes(
            outputFileType.toLowerCase()
          )
        );
      }
      return true;
    },
  },
};

const modelValidation = {
  carbone: async (obj) => {
    const errors = [];

    if (!models.carbone.data(obj.data)) {
      errors.push({ value: obj.data, message: "Invalid value `data`." });
    }
    if (!models.carbone.options(obj.options)) {
      errors.push({ value: obj.options, message: "Invalid value `options`." });
    } else if (obj.options) {
      if (!models.carbone.convertTo(obj.options.convertTo)) {
        errors.push({
          value: obj.options.convertTo,
          message: "Invalid value `options.convertTo`.",
        });
      }
      if (!models.carbone.reportName(obj.options.reportName)) {
        errors.push({
          value: obj.options.reportName,
          message: "Invalid value `options.reportName`.",
        });
      }
    }
    if (!models.carbone.formatters(obj.formatters)) {
      errors.push({
        value: obj.formatters,
        message: "Invalid value `formatters`.",
      });
    } else {
      if (obj.formatters) {
        try {
          telejson.parse(obj.formatters, { allowFunction: true });
        } catch (e) {
          errors.push({
            value: obj.formatters,
            message:
              "Formatters could not be parsed into formatters object. See 'https://www.npmjs.com/package/telejson'.",
          });
        }
      }
    }
    return errors;
  },

  template: async (obj, limit) => {
    let errors = await modelValidation.carbone(obj);
    if (!errors.length) {
      if (!models.template(obj.template)) {
        errors.push({
          value: obj.template,
          message: "Invalid value `template`.",
        });
      }
      if (!errors.length) {
        if (!models.templateContent.mandatory(obj.template)) {
          errors.push({
            message:
              "Invalid template. Mandatory fields missing. Require content, encodingType and fileType.",
          });
        } else {
          let validateSize = true;

          if (!models.templateContent.fileType(obj.template.fileType)) {
            errors.push({
              value: obj.template.fileType,
              message: "Invalid value `template.fileType`.",
            });
            validateSize = false;
          }

          if (!models.templateContent.content(obj.template.content)) {
            errors.push({
              value: obj.template.content,
              message: "Invalid value `template.content`.",
            });
            validateSize = false;
          }

          if (!models.templateContent.encodingType(obj.template.encodingType)) {
            errors.push({
              value: obj.template.encodingType,
              message: "Invalid value `template.encodingType`.",
            });
            validateSize = false;
          }

          if (validateSize) {
            const validSize = await models.templateContent.size(
              obj.template.content,
              obj.template.encodingType,
              limit
            );
            if (!validSize) {
              errors.push({
                value: "Template document too large",
                message: `Template exceeds size limit of ${bytes.format(
                  limit,
                  "MB"
                )}.`,
              });
            }
          }

          const outputFileType =
            obj.options && obj.options.convertTo
              ? obj.options.convertTo
              : "pdf";
          const validConversion = models.templateContent.fileConversion(
            obj.template.fileType,
            outputFileType
          );
          if (!validConversion) {
            errors.push({
              values: [obj.template.fileType, outputFileType],
              message:
                "Unsupported file type conversion. A dictionary of supported input and output file types can be found at API endpoint '/fileTypes'",
            });
          }
        }
      }
    }

    return errors;
  },
};

let maxFileSize = bytes.parse("25MB");

module.exports = {
  init(options) {
    maxFileSize =
      (options && (options.maxFileSize || options["max-file-size"])) ||
      process.env.FILE_UPLOADS_MAX_FILE_SIZE ||
      "25MB";
    try {
      maxFileSize = bytes.parse(maxFileSize);
    } catch (e) {
      throw new Error(
        "Could not determine max file size (bytes) for file uploads."
      );
    }
  },

  async validateCarbone(req, res, next) {
    const errors = await modelValidation.carbone(req.body);
    handleValidationErrors(res, next, errors);
  },

  async validateTemplate(req, res, next) {
    const errors = await modelValidation.template(req.body, maxFileSize);
    handleValidationErrors(res, next, errors);
  },
};
