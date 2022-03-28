# DISCLAIMER! This is a Work-in-progress. Still not working as intended!

Play around at your own risk

# trioweb-stripe-payments

This package implements [stripe/react-stripe-js](https://github.com/stripe/react-stripe-js) elements as an extension.
It provides a `stripe_payments` payment method for any PWA created using the [magento/pwa-studio](https://github.com/magento/pwa-studio) platform.

## Prerequesites

This extension will only work if supplemented with a backend Magento2 plugin like this one:

[ScandiPWA stripe-graphql back-end Magento2 module](https://github.com/scandipwa/stripe-graphql)


## Installation

To install this extension, add it as a `devDependency` to your app.
project:

`yarn add -D @trioweb/stripe-payments`

## Attributions and aknowledgements

The code in this repository is created by [TrioWeb AS](https://github.com/TrioWebAS) and provided under the OSL 3.0 licence.

Most of the code is an adoptation of the [ScandiPWA/stripe-payments](https://github.com/scandipwa/stripe-payments/) plugin for the [ScandiPWA](https://scandipwa.com/) open source PWA theme for Magento.

This extension is built to work with [PWA-studio](https://github.com/magento/pwa-studio) and has also taken much inspiration from that project.

Special thanks to [Lars Roetting](https://github.com/larsroettig) for his work with the [venia-sample-payments-checkmo](https://github.com/magento/pwa-studio/tree/develop/packages/extensions/venia-sample-payments-checkmo) sample payments extension and tutorials/documentation.
