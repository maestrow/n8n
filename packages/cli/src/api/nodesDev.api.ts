/* eslint-disable import/no-cycle */
import express from 'express';
import {
	CommunityPackages,
	InternalHooksManager,
	LoadNodesAndCredentials,
	Push,
	ResponseHelper,
} from '..';

import { isClientError, parseNpmPackageName } from '../CommunityNodes/helpers';
import { findInstalledPackage } from '../CommunityNodes/packageModel';
import { RESPONSE_ERROR_MESSAGES, UNKNOWN_FAILURE_REASON } from '../constants';
import { InstalledPackages } from '../databases/entities/InstalledPackages';

import type { NodeRequest } from '../requests';

const { PACKAGE_NOT_INSTALLED, PACKAGE_NAME_NOT_PROVIDED } = RESPONSE_ERROR_MESSAGES;

export const nodesDevController = express.Router();

// install
nodesDevController.post(
	'/install',
	ResponseHelper.send(async (req: NodeRequest.Post) => {
		const { name } = req.body;

		if (!name) {
			throw new ResponseHelper.ResponseError(PACKAGE_NAME_NOT_PROVIDED, undefined, 400);
		}

		let parsed: CommunityPackages.ParsedPackageName;

		try {
			parsed = parseNpmPackageName(name);
		} catch (error) {
			throw new ResponseHelper.ResponseError(
				error instanceof Error ? error.message : 'Failed to parse package name',
				undefined,
				400,
			);
		}

		let installedPackage: InstalledPackages;

		try {
			installedPackage = await LoadNodesAndCredentials().loadNpmModule(parsed.packageName);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : UNKNOWN_FAILURE_REASON;

			void InternalHooksManager.getInstance().onCommunityPackageInstallFinished({
				user_id: req.user.id,
				input_string: name,
				package_name: parsed.packageName,
				success: false,
				package_version: parsed.version,
				failure_reason: errorMessage,
			});

			const message = [`Error loading package "${name}"`, errorMessage].join(':');

			const clientError = error instanceof Error ? isClientError(error) : false;

			throw new ResponseHelper.ResponseError(message, undefined, clientError ? 400 : 500);
		}

		const pushInstance = Push.getInstance();

		// broadcast to connected frontends that node list has been updated
		installedPackage.installedNodes.forEach((node) => {
			pushInstance.send('reloadNodeType', {
				name: node.type,
				version: node.latestVersion,
			});
		});

		void InternalHooksManager.getInstance().onCommunityPackageInstallFinished({
			user_id: req.user.id,
			input_string: name,
			package_name: parsed.packageName,
			success: true,
			package_version: parsed.version,
			package_node_names: installedPackage.installedNodes.map((node) => node.name),
			package_author: installedPackage.authorName,
			package_author_email: installedPackage.authorEmail,
		});

		return installedPackage;
	}),
);

// update
nodesDevController.post(
	'/update',
	ResponseHelper.send(async (req: NodeRequest.Post) => {
		const { name } = req.body;

		if (!name) {
			throw new ResponseHelper.ResponseError(PACKAGE_NAME_NOT_PROVIDED, undefined, 400);
		}

		const previouslyInstalledPackage = await findInstalledPackage(name);

		if (!previouslyInstalledPackage) {
			throw new ResponseHelper.ResponseError(PACKAGE_NOT_INSTALLED, undefined, 400);
		}

		try {
			const newInstalledPackage = await LoadNodesAndCredentials().updateModule(
				parseNpmPackageName(name).packageName,
				previouslyInstalledPackage,
			);

			const pushInstance = Push.getInstance();

			// broadcast to connected frontends that node list has been updated
			previouslyInstalledPackage.installedNodes.forEach((node) => {
				pushInstance.send('removeNodeType', {
					name: node.type,
					version: node.latestVersion,
				});
			});

			newInstalledPackage.installedNodes.forEach((node) => {
				pushInstance.send('reloadNodeType', {
					name: node.name,
					version: node.latestVersion,
				});
			});

			void InternalHooksManager.getInstance().onCommunityPackageUpdateFinished({
				user_id: req.user.id,
				package_name: name,
				package_version_current: previouslyInstalledPackage.installedVersion,
				package_version_new: newInstalledPackage.installedVersion,
				package_node_names: newInstalledPackage.installedNodes.map((node) => node.name),
				package_author: newInstalledPackage.authorName,
				package_author_email: newInstalledPackage.authorEmail,
			});

			return newInstalledPackage;
		} catch (error) {
			previouslyInstalledPackage.installedNodes.forEach((node) => {
				const pushInstance = Push.getInstance();
				pushInstance.send('removeNodeType', {
					name: node.type,
					version: node.latestVersion,
				});
			});

			const message = [
				`Error removing package "${name}"`,
				error instanceof Error ? error.message : UNKNOWN_FAILURE_REASON,
			].join(':');

			throw new ResponseHelper.ResponseError(message, undefined, 500);
		}
	}),
);
