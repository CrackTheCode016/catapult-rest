/*
 * Copyright (c) 2016-present,
 * Jaguar0625, gimre, BloodyRookie, Tech Bureau, Corp. All rights reserved.
 *
 * This file is part of Catapult.
 *
 * Catapult is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Catapult is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Catapult.  If not, see <http://www.gnu.org/licenses/>.
 */

const routeResultTypes = require('./routeResultTypes');
const routeUtils = require('./routeUtils');
const catapult = require('catapult-sdk');

const { convert } = catapult.utils;
const { PacketType } = catapult.packet;

const constants = {
	sizes: {
		hash: 64,
		objectId: 24
	}
};

const parseHeight = params => routeUtils.parseArgument(params, 'height', 'uint');

const parseObjectId = str => {
	if (!convert.isHexString(str))
		throw Error('must be 12-byte hex string');

	return str;
};

module.exports = {
	register: (server, db, services) => {
		const sender = routeUtils.createSender(routeResultTypes.transaction);

		routeUtils.addPutPacketRoute(
			server,
			services.connections,
			{ routeName: '/transaction', packetType: PacketType.pushTransactions },
			params => routeUtils.parseArgument(params, 'payload', convert.hexToUint8)
		);

		routeUtils.addGetPostDocumentRoutes(
			server,
			sender,
			{ base: '/transaction', singular: 'transactionId', plural: 'transactionIds' },
			// params has already been converted by a parser below, so it is: string - in case of objectId, Uint8Array - in case of hash
			params => (('string' === typeof params[0]) ? db.transactionsByIds(params) : db.transactionsByHashes(params)),
			(transactionId, index, array) => {
				if (0 < index && array[0].length !== transactionId.length)
					throw Error(`all ids must be homogeneous, element ${index}`);

				if (constants.sizes.objectId === transactionId.length)
					return parseObjectId(transactionId);
				if (constants.sizes.hash === transactionId.length)
					return convert.hexToUint8(transactionId);

				throw Error(`invalid length of transaction id '${transactionId}'`);
			}
		);

		server.get('/transactions', (req, res, next) => {
			if (req.params.address && (req.params.signerPublicKey || req.params.recipientAddress))
				throw Error('can\'t filter by address if signerPublicKey or recipientAddress are already provided');

			if (req.params.state && !['confirmed', 'unconfirmed', 'partial'].includes(req.params.state))
				throw Error('invalid transaction state provided');

			const filters = {
				height: req.params.height ? parseHeight(req.params) : undefined,
				address: req.params.height ? routeUtils.parseArgument(req.params, 'address', 'address') : undefined,
				signerPublicKey: req.params.height ? routeUtils.parseArgument(req.params, 'signerPublicKey', 'publicKey') : undefined,
				recipientAddress: req.params.height ? routeUtils.parseArgument(req.params, 'recipientAddress', 'address') : undefined,
				transactionTypes: req.params.type ? routeUtils.parseArgumentAsArray(req.params, 'type', 'uint') : undefined,
				state: req.params.state
			};

			const options = routeUtils.parsePaginationArguments(req.params);

			return db.transactions(filters, options)
				.then(result => routeUtils.createSender(routeResultTypes.transaction).sendPage(res, next)(result));
		});
	}
};
