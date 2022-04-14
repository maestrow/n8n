/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
/* eslint-disable import/no-cycle */
import * as OpenApiValidator from 'express-openapi-validator';

import path = require('path');

import express = require('express');

import { HttpError } from 'express-openapi-validator/dist/framework/types';

import { authenticationHandler, specFormats } from '../helpers';

export const publicApiControllerV1 = express.Router();

const openApiSpec = path.join(__dirname, 'openapi.yml');

publicApiControllerV1.use('/v1/spec', express.static(openApiSpec));

publicApiControllerV1.use('/v1', express.json());

publicApiControllerV1.use(
	'/v1',
	OpenApiValidator.middleware({
		apiSpec: openApiSpec,
		operationHandlers: path.join(__dirname, '..'),
		validateRequests: true,
		validateApiSpec: true,
		formats: specFormats(),
		validateSecurity: {
			handlers: {
				ApiKeyAuth: authenticationHandler,
			},
		},
	}),
);

// error handler
publicApiControllerV1.use(
	(error: HttpError, req: express.Request, res: express.Response, next: express.NextFunction) => {
		return res.status(error.status || 400).json({
			message: error.message,
		});
	},
);
