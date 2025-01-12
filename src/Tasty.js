const { promisify } = require('util');
const waterfall = promisify(require('async/waterfall'));
const parallel = promisify(require('async/parallel'));
const { evalTpl } = require('../libs/utils');

/** Class representing a Tasty library */
class Tasty {
  getRunner() {
    /**
     * @todo For programmatic usage, we need, Tasty object returns instance for multiple launching, and getting
     *  statistics after all tests are finished.
     *  Probably better to move it into another abstract entity, for example Runner class.
     */
  };

  /**
   * Describe a test case
   * @param {string} title - Test case title
   * @param {function[]} actions - Test actions
   */
  case(title, ...actions) {
    this.context = {};

    const sets = splitActions(actions);

    describe(title, () => {
      if (sets.before.length) {
        before(async () => {
          this.context = await this.series(...sets.before)(this.context);
        });
      }

      if (sets.beforeEach.length) {
        /* @todo Implement launching of actions beforeEach test
        beforeEach(async () => {
          this.context = await this.series(...sets.beforeEach)(this.context);
        });
        */
      }

      sets.tests.forEach(test => test());

      if (sets.afterEach.length) {
        /* @todo Implement launching of actions afterEach test
        afterEach(async () => {
          this.context = await this.series(...sets.afterEach)(this.context);
        });
        */
      }

      if (sets.after.length) {
        /* @todo Implement launching of actions after test
        after(async () => {
          this.context = await this.series(...sets.after)(this.context);
        });
        */
      }
    });
  };

  /**
   * Describe a set of actions
   * @param {function[]} actions - Test actions, which will be done in series
   * @returns {function} Function which sent request in series
   */
  series(...actions) {
    return async function requests(context) {
      return {
        ...context,
        ...(await waterfall(actions.map(action => (
          async (prevCtx = {}) => ({
            ...prevCtx,
            ...(action.name === 'request' ?
              (await action(prevCtx)).snapshot :
              await action(prevCtx)),
          })
        )))),
      };
    };
  }

  /**
   * Describe a set of action
   * @param {function[]} actions - Test actions, which will be done in parallel
   * @returns {function} Function which sent request in parallel
   */
  parallel(...actions) {
    return async function requests(context) {
      const contexts = await parallel(actions.map(action => {
        return async () => ({
          ...(action.name === 'request' ?
            (await action()).snapshot :
            await action()),
        });
      }));

      return {
        ...context,
        ...(contexts.reduce((acc, ctx) => {
          return {
            ...acc,
            ...ctx,
          };
        }, {})),
      };
    };
  }

  /**
   * Describe a test suite
   * @param {string} title - Title of test suite
   * @param {function} request - Request for testing
   * @param {object} assertions - Set of necessary assertions
   * @returns {function} - Function which start test
   */
  suite(title, request, assertions) {
    const self = this;

    return function test () {
      it(title, async () => {
        const resource = await request(self.context);

        Object.keys(assertions).forEach(assertion => {
          resource[assertion](assertions[assertion], self.context);
        });
      });
    };
  }

  /**
   * Describe a suites of tests
   * @param title
   * @param suites
   * @param request
   * @param assertions
   * @param isParallel
   * @returns {tests}
   */
  suites(title, suites, request, assertions, isParallel) {
    const self = this;

    return function tests () {
      if (isParallel) {
        let responses = [];

        before(async () => {
          responses = await parallel(suites.map(suite => (
            async () => request({
              ...self.context,
              suite,
            })
          )));
        });

        suites.forEach((suite, i) => {
          it(evalTpl(title, { suite }), () => {
            Object.keys(assertions).forEach(key => {
              const assertion = typeof assertions[key] === 'string'
                ? evalTpl(assertions[key], { suite })
                : assertions[key];

              responses[i][key](assertion, { suite });
            });
          });
        });
      } else {
        suites.forEach((suite) => {
          it(evalTpl(title, { suite }), async () => {
            const resource = await request({
              ...self.context,
              suite,
            });

            Object.keys(assertions).forEach(key => {
              const assertion = typeof assertions[key] === 'string'
                ? evalTpl(assertions[key], { suite })
                : assertions[key];

              resource[assertion](key, { suite });
            });
          });
        });
      }
    }
  }
}

module.exports = Tasty;

/**
 * @function splitActions - Split action on three five groups
 * @param {function[]} actions - Tests actions
 * @returns {object} - Object with actions' groups
 */
function splitActions(actions) {
  return actions.reduce((sets, action) => {
    if (typeof action === 'function' && (action.name === 'test' || action.name === 'tests')) {
      sets.tests.push(action);

      return sets;
    }

    if (sets.tests.length) {
      if (Array.isArray(action)) {
        sets.afterEach.push(action);
      } else {
        sets.after.push(action);
      }

      return sets;
    }

    if (Array.isArray(action)) {
      sets.beforeEach.push(action);
    } else {
      sets.before.push(action);
    }

    return sets;
  }, {
    before: [],
    beforeEach: [],
    after: [],
    afterEach: [],
    tests: [],
  });
}
