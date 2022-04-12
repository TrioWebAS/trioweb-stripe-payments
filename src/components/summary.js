import React from 'react';
import { shape, string, func, bool } from 'prop-types';
import { FormattedMessage, useIntl } from 'react-intl';
import { useStyle } from '@magento/venia-ui/lib/classify';
import { Edit2 as EditIcon } from 'react-feather';

import Icon from '@magento/venia-ui/lib/components/Icon';
import LinkButton from '@magento/venia-ui/lib/components/LinkButton';
import LoadingIndicator from '@magento/venia-ui/lib/components/LoadingIndicator';

import defaultClasses from '@magento/venia-ui/lib/components/CheckoutPage/PaymentInformation/braintreeSummary.module.css';
import { useStripeSummary } from '../talons/useStripeSummary.js';

const StripeSummary = props => {
    const { classes: propClasses, onEdit } = props;

    const classes = useStyle(defaultClasses, propClasses);
    const { formatMessage } = useIntl();

    const {
        billingAddress,
        isBillingAddressSame,
        isLoading,
        paymentMethod
    } = useStripeSummary();

    if (isLoading) {
        return (
            <LoadingIndicator classes={{ root: classes.loading }}>
                <FormattedMessage
                    id={'checkoutPage.loadingPaymentInformation'}
                    defaultMessage={'Fetching Payment Information'}
                />
            </LoadingIndicator>
        );
    }

    const paymentSummary =
        paymentMethod &&
        formatMessage(
            {
                id: 'checkoutPage.paymentSummary',
                defaultMessage: '{cardType} ending in {lastFour}'
            },
            {
                cardType: paymentMethod.details.cardType,
                lastFour: paymentMethod.details.lastFour
            }
        );

    const billingAddressSummary =
        !isBillingAddressSame && billingAddress ? (
            <div className={classes.address_summary_container}>
                <div>
                    <span className={classes.first_name}>
                        {billingAddress.firstName}
                    </span>
                    <span className={classes.last_name}>
                        {billingAddress.lastName}
                    </span>
                </div>
                <div>
                    <span className={classes.street1}>
                        {billingAddress.street1}
                    </span>
                    <span className={classes.street2}>
                        {billingAddress.street2}
                    </span>
                    <span className={classes.city}>{billingAddress.city}</span>
                    <span className={classes.state}>
                        {billingAddress.state}
                    </span>
                </div>
                <div>
                    <span className={classes.postalCode}>
                        {billingAddress.postalCode}
                    </span>
                    <span className={classes.country}>
                        {billingAddress.country}
                    </span>
                </div>
            </div>
        ) : null;

    return (
        <div className={classes.root}>
            <div className={classes.heading_container}>
                <h5 className={classes.heading}>
                    <FormattedMessage
                        id={'checkoutPage.paymentInformation'}
                        defaultMessage={'Payment Information'}
                    />
                </h5>
                <LinkButton
                    className={classes.edit_button}
                    onClick={onEdit}
                    type="button"
                    data-cy="BrainTreeSummary-editButton"
                >
                    <Icon
                        size={16}
                        src={EditIcon}
                        classes={{ icon: classes.edit_icon }}
                    />
                    <span className={classes.edit_text}>
                        <FormattedMessage
                            id={'global.editButton'}
                            defaultMessage={'Edit'}
                        />
                    </span>
                </LinkButton>
            </div>
            <div className={classes.card_details_container}>
                <span className={classes.payment_type}>
                    <FormattedMessage
                        id={'global.creditCard'}
                        defaultMessage={'Credit Card'}
                    />
                </span>
                <span className={classes.payment_details}>
                    {paymentSummary}
                </span>
            </div>
            {billingAddressSummary}
        </div>
    );
};

export default StripeSummary;

StripeSummary.propTypes = {
    classes: shape({
        root: string,
        heading_container: string,
        heading: string,
        edit_button: string,
        card_details_container: string,
        address_summary_container: string,
        first_name: string,
        last_name: string,
        street1: string,
        street2: string,
        city: string,
        postalCode: string,
        country: string,
        payment_type: string,
        payment_details: string
    }),
    billingAddress: shape({
        firstName: string,
        lastName: string,
        country: string,
        street1: string,
        street2: string,
        city: string,
        state: string,
        postalCode: string
    }),
    onEdit: func.isRequired,
    isBillingAddressSame: bool
};
