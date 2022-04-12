module.exports = targets => {
    //const { specialFeatures, envVarDefinitions } = targets.of('@magento/pwa-buildpack');
    const { specialFeatures } = targets.of('@magento/pwa-buildpack');
    specialFeatures.tap(flags => {
        /**
         *  Wee need to activate esModules, cssModules and GQL Queries to allow build pack to load our extension
         * {@link https://magento.github.io/pwa-studio/pwa-buildpack/reference/configure-webpack/#special-flags}.
         */
        flags[targets.name] = {
            esModules: true,
            cssModules: true,
            graphqlQueries: true
        };
    });

    /***
     *  Add the required Stripe Elements provider on the top-level of the PWA
     *  Note: had issues injecting this in the appContextProvider - surrounding the output from LocaleProvider instead
     ***/

    const { Targetables } = require('@magento/pwa-buildpack');
    const targetables = Targetables.using(targets);

    // Create targetable react component of the localeProvider.js file
    const LocaleProvider = targetables.reactComponent(
        '@magento/venia-ui/lib/components/App/localeProvider.js'
    );
    const StripeProvider = LocaleProvider.addImport(
        "StripeContext from '@trioweb/stripe-payments/src/components/StripeProvider.js'"
    );
    LocaleProvider.surroundJSX('IntlProvider', `<${StripeProvider}>`);

    /*
    envVarDefinitions.tap(defs => {
        defs.sections.push({
            name: 'Stripe publishable test key',
            variables: [
                {
                    name: 'STRIPE_TEST_KEY',
                    type: 'str',
                    desc: 'API key for stripe-payments testing'
                }
            ]
        });
    });
    */
    const {
        checkoutPagePaymentTypes,
        //editablePaymentTypes,
        summaryPagePaymentTypes
    } = targets.of('@magento/venia-ui');
    checkoutPagePaymentTypes.tap(payments =>
        payments.add({
            paymentCode: 'stripe_payments',
            importPath: '@trioweb/stripe-payments/src/components/creditCard.js'
        })
    );
    /*
    savedPaymentTypes.tap(savedPayments =>
        savedPayments.add({
            paymentCode: 'stripe_payments',
            importPath: '@trioweb/stripe-payments/src/components/creditCard.js'
        })
    );
    editablePaymentTypes.tap(editablePaymentTypes => {
        editablePaymentTypes.add({
            paymentCode: 'stripe_payments',
            importPath: '@trioweb/stripe-payments/src/components/edit.js'
        });
    });
    */
    summaryPagePaymentTypes.tap(paymentSummaries =>
        paymentSummaries.add({
            paymentCode: 'stripe_payments',
            importPath: '@trioweb/stripe-payments/src/components/summary.js'
        })
    );
};
