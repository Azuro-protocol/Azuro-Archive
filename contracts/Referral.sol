// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract Referral is OwnableUpgradeable {
    uint256 public l1RefShare;
    uint256 public l2RefShare;
    uint256 public l3RefShare;

    mapping(address => address) public referrals; //list of referrers
    mapping(address => bool) private _refGranted;

    modifier refGranted() {
        require(_refGranted[msg.sender], "Referral: caller is not alowed");
        _;
    }

    /* Admin funcitons */

    /**
     * Owner grants some wallet to add referrers
     */
    function grantRef(address _newIssuer) public onlyOwner {
        require(_newIssuer != address(0), "Referral: Zero address");
        _refGranted[_newIssuer] = true;
    }

    /**
     * Owner revoke rights from some wallet for adding referrers
     */
    function revokeRef(address _revokeIssuer) public onlyOwner {
        require(_revokeIssuer != address(0), "Referral: Zero address");
        if (_refGranted[_revokeIssuer]) {
            _refGranted[_revokeIssuer] = false;
        }
    }

    function initialize(
        uint256 _l1RefShare,
        uint256 _l2RefShare,
        uint256 _l3RefShare
    ) public initializer {
        l1RefShare = _l1RefShare;
        l2RefShare = _l2RefShare;
        l3RefShare = _l3RefShare;
    }

    /* Core functions */

    /**
     * return actual referrer's stakes for each of three level
     */
    function getRefStakes()
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        return (l1RefShare, l2RefShare, l3RefShare);
    }

    /** Add referrer for the _user. Only granted wallet can do it
     * _user was invited by _referrer
     * @param _user - user wallet, was invited by _referrer
     * @param _referrer - invited _user for getting %
     */
    function addReferrer(address _user, address _referrer)
        external
        refGranted()
    {
        referrals[_user] = _referrer;
    }

    /** Get referrer's chain of the wallet address by three levels:
     * _user was invited by l1, l1 was invited by l2, l2 was invited by l3
     * @param _user - wallet for getting it's referrer chain wallets
     * @return userReferrers - three levels of _user's referrers
     */
    function getReferrerChain(address _user)
        external
        view
        returns (address[] memory userReferrers)
    {
        address l1 = referrals[_user];

        // len == 0
        if (l1 == address(0)) {
            return userReferrers;
        }

        // len == 1
        address l2 = referrals[l1];
        if (l2 == address(0)) {
            userReferrers = new address[](1);
            userReferrers[0] = l1;
            return userReferrers;
        }

        // len == 2
        address l3 = referrals[l2];
        if (l3 == address(0)) {
            userReferrers = new address[](2);
            userReferrers[0] = l1;
            userReferrers[1] = l2;

            return userReferrers;
        }

        // len == 3
        userReferrers = new address[](3);
        userReferrers[0] = l1;
        userReferrers[1] = l2;
        userReferrers[2] = l3;
    }
}
