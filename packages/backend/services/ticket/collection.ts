import revertAuthMiddleware from '../../helpers/authMiddleware';
import revertTenantMiddleware from '../../helpers/tenantIdMiddleware';
import { logInfo, logError } from '../../helpers/logger';
import { isStandardError } from '../../helpers/error';
import { InternalServerError, NotFoundError } from '../../generated/typescript/api/resources/common';
import { CollectionService } from '../../generated/typescript/api/resources/ticket/resources/collection/service/CollectionService';
import { TP_ID } from '@prisma/client';
import { LinearClient } from '@linear/sdk';
import axios from 'axios';

var collectionServiceTicket = new CollectionService(
    {
        async getCollections(req, res) {
            try {
                var connection = res.locals.connection;
                // var account = res.locals.account;
                var fields: any = req.query.fields;
                var pageSize = parseInt(String(req.query.pageSize));
                var cursor = req.query.cursor;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                logInfo(
                    'Revert::GET ALL COLLECTIONS',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                );

                switch (thirdPartyId) {
                    case TP_ID.linear: {
                        var linear = new LinearClient({
                            accessToken: thirdPartyToken,
                        });

                        let parsedFields: any = fields ? JSON.parse(fields) : undefined;

                        var pagination = {
                            first: pageSize ? pageSize : null,
                            after: cursor ? cursor : null,
                        };

                        let result: any;
                        let pageInfo: any;

                        if (parsedFields && parsedFields.collection_type === 'list') {
                            throw new Error('Linear does not support for collection_type list');
                        } else if (parsedFields && parsedFields.collection_type === 'project') {
                            result = await linear.projects(pagination);
                            pageInfo = result.pageInfo;
                            result = result.nodes;
                        } else if (parsedFields && parsedFields.collection_type === 'space') {
                            throw new Error('Linear does not support for collection_type space');
                        } else if (parsedFields && parsedFields.collection_type === 'team') {
                            result = await linear.teams(pagination);
                            pageInfo = result.pageInfo;
                            result = result.nodes;
                        } else {
                            throw new Error(
                                "To use this endpoint, please specify the type of collection you're working with. Valid options include: 'list', 'folder', 'space', or 'team'.",
                            );
                        }

                        let next_cursor = undefined;
                        if (pageInfo && pageInfo.hasNextPage && pageInfo.endCursor) {
                            next_cursor = pageInfo.endCursor;
                        }

                        let previous_cursor = undefined;
                        if (pageInfo && pageInfo.hasPreviousPage && pageInfo.startCursor) {
                            previous_cursor = pageInfo.startCursor;
                        }

                        res.send({
                            status: 'ok',
                            next: next_cursor,
                            previous: previous_cursor,
                            results: result,
                        });
                        break;
                    }
                    case TP_ID.clickup: {
                        let parsedFields: any = fields ? JSON.parse(fields) : undefined;
                        var pagingString = `${cursor ? `page=${cursor}` : ''}`;
                        let result: any;
                        let pageNumber: any;
                        if (parsedFields && parsedFields.collection_type === 'list') {
                            if (!parsedFields.folderId) {
                                throw new Error(
                                    "To retrieve all lists in Clickup, folderId is required. Please set collection_type to 'folder' to verify.",
                                );
                            }
                            result = await axios({
                                method: 'get',
                                url: `https://api.clickup.com/api/v2/folder/${parsedFields.folderId}/list?archived=false&${pagingString}`,
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                    'Content-Type': 'application/json',
                                },
                            });
                            pageNumber = !result.data?.last_page
                                ? cursor
                                    ? (parseInt(String(cursor)) + 1).toString()
                                    : '1'
                                : undefined;
                            result = result.data.lists;
                        } else if (parsedFields && parsedFields.collection_type === 'folder') {
                            if (!parsedFields.spaceId) {
                                throw new Error(
                                    "To retrieve all folders in Clickup, spaceId is required. Please set collection_type to 'space' to verify.",
                                );
                            }
                            result = await axios({
                                method: 'get',
                                url: `https://api.clickup.com/api/v2/space/${parsedFields.spaceId}/folder?archived=false&${pagingString}`,
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                    'Content-Type': 'application/json',
                                },
                            });
                            pageNumber = !result.data?.last_page
                                ? cursor
                                    ? (parseInt(String(cursor)) + 1).toString()
                                    : '1'
                                : undefined;
                            result = result.data.folders;
                        } else if (parsedFields && parsedFields.collection_type === 'space') {
                            if (!parsedFields.teamId) {
                                throw new Error(
                                    "To retrieve all folders in Clickup, teamId is required. Please set collection_type to 'team' to verify.",
                                );
                            }
                            result = await axios({
                                method: 'get',
                                url: `https://api.clickup.com/api/v2/team/${parsedFields.teamId}/space?archived=false&${pagingString}`,
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                    'Content-Type': 'application/json',
                                },
                            });
                            pageNumber = !result.data?.last_page
                                ? cursor
                                    ? (parseInt(String(cursor)) + 1).toString()
                                    : '1'
                                : undefined;
                            result = result.data.spaces;
                        } else if (parsedFields && parsedFields.collection_type === 'team') {
                            result = await axios({
                                method: 'get',
                                url: `https://api.clickup.com/api/v2/team?${pagingString}`,
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                    'Content-Type': 'application/json',
                                },
                            });
                            pageNumber = !result.data?.last_page
                                ? cursor
                                    ? (parseInt(String(cursor)) + 1).toString()
                                    : '1'
                                : undefined;
                            result = result.data.teams;
                        } else {
                            throw new Error(
                                "To use this endpoint, please specify the type of collection you're working with. Valid options include: 'list', 'folder', 'space', or 'team'.",
                            );
                        }

                        res.send({
                            status: 'ok',
                            next: pageNumber,
                            previous: undefined,
                            results: result,
                        });
                        break;
                    }
                    case TP_ID.jira: {
                        let parsedFields: any = fields ? JSON.parse(fields) : undefined;
                        let result: any;
                        if (parsedFields && parsedFields.collection_type === 'boards') {
                            var boards = await axios({
                                method: 'get',
                                url: `${connection.tp_account_url}/rest/agile/1.0/board`,
                                headers: {
                                    Accept: 'application/json',
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            });
                            result = boards.data.values;
                        } else if (parsedFields && parsedFields.collection_type === 'projects') {
                            var projects = await axios({
                                method: 'get',
                                url: `${connection.tp_account_url}/rest/api/2/project/search`,
                                headers: {
                                    Accept: 'application/json',
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            });
                            result = projects.data.values;
                        }

                        res.send({
                            status: 'ok',
                            next: 'nextCursor',
                            previous: 'previousCursor',
                            results: result,
                        });
                        break;
                    }
                    case TP_ID.trello: {
                        let parsedFields: any = fields ? JSON.parse(fields) : undefined;
                        let result: any;
                        if (parsedFields && parsedFields.collection_type === 'boards') {
                            var boards = await axios({
                                method: 'get',
                                url: `https://api.trello.com/1/members/me/boards?key=${connection.app_client_id}&token=${thirdPartyToken}`,
                                headers: {
                                    Accept: 'application/json',
                                },
                            });
                            result = boards.data;
                        } else if (parsedFields && parsedFields.collection_type === 'lists') {
                            if (!parsedFields.boardId) {
                                throw new Error('To retrieve all lists in Trello, boardId is required.');
                            }
                            var lists = await axios({
                                method: 'get',
                                url: `https://api.trello.com/1/boards/${parsedFields.boardId}?lists=all&key=${connection.app_client_id}&token=${thirdPartyToken}`,
                                headers: {
                                    Accept: 'application/json',
                                },
                            });

                            result = lists.data.lists;
                        }

                        res.send({
                            status: 'ok',
                            next: 'next_cursor',
                            previous: 'previous_cursor',
                            results: result,
                        });
                        break;
                    }
                    case TP_ID.bitbucket: {
                        let parsedFields: any = fields ? JSON.parse(fields) : undefined;
                        let result: any;
                        var pagingString = `${pageSize ? `page=${pageSize}` : ''}`;
                        if (parsedFields && parsedFields.collection_type === 'groups') {
                            if (!parsedFields.workspace) {
                                throw new Error(
                                    "To retrieve all groups in a workspace in Bitbucket, workspace is required. Please set collection_type to 'groups' to verify.",
                                );
                            }
                            var groups = await axios({
                                method: 'get',
                                url: `https://api.bitbucket.org/1.0/groups/${parsedFields.workspace}?pagelen=10&${pagingString}`,
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                    Accept: 'application/json',
                                    'Content-Type': 'application/json',
                                },
                            });
                            result = groups.data;

                            return res.send({
                                status: 'ok',
                                next: undefined,
                                previous: undefined,
                                results: result,
                            });
                        } else if (parsedFields && parsedFields.collection_type === 'repositories') {
                            if (!parsedFields.workspace) {
                                throw new Error(
                                    "To retrieve all repositories in a workspace in Bitbucket, workspace is required. Please set collection_type to 'repositories' to verify.",
                                );
                            }
                            var projects = await axios({
                                method: 'get',
                                url: `https://api.bitbucket.org/2.0/repositories/${parsedFields.workspace}?pagelen=10&${pagingString}`,
                                headers: {
                                    Accept: 'application/json',
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            });
                            result = projects.data;

                            var pageNumber = result.next ? (pageSize ? (pageSize + 1).toString() : '1') : undefined;
                            return res.send({
                                status: 'ok',
                                next: pageNumber,
                                previous: undefined,
                                results: result.values,
                            });
                        } else {
                            throw new Error(
                                "To use this endpoint, please specify the type of collection you're working with. Valid options include: 'groups', 'repositories'.",
                            );
                        }

                        break;
                    }
                    case TP_ID.github: {
                        let parsedFields: any = fields ? JSON.parse(fields) : undefined;
                        let result: any;
                        let pagingString = `${pageSize ? `&per_page=${pageSize}` : ''}${
                            cursor ? `&page=${cursor}` : ''
                        }`;
                        if (parsedFields && parsedFields.collection_type === 'projects') {
                            if (!parsedFields.owner || !parsedFields.repo) {
                                throw new Error(
                                    'To retrieve all projects in a repository in GitHub, "owner" and "repo" are required in the "fields" parameter.',
                                );
                            }
                            var projects = await axios({
                                method: 'get',
                                url: `https://api.github.com/repos/${parsedFields.owner}/${parsedFields.repo}/projects?${pagingString}`,
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                    Accept: 'application/vnd.github+json',
                                },
                            });
                            result = projects.data;

                            var linkHeader = projects.headers.link;
                            let nextCursor, previousCursor;
                            if (linkHeader) {
                                var links = linkHeader.split(',');

                                links?.forEach((link: any) => {
                                    if (link.includes('rel="next"')) {
                                        nextCursor = Number(link.match(/[&?]page=(\d+)/)[1]);
                                    } else if (link.includes('rel="prev"')) {
                                        previousCursor = Number(link.match(/[&?]page=(\d+)/)[1]);
                                    }
                                });
                            }

                            return res.send({
                                status: 'ok',
                                next: nextCursor ? String(nextCursor) : undefined,
                                previous: previousCursor !== undefined ? String(previousCursor) : undefined,
                                results: result,
                            });
                        } else if (parsedFields && parsedFields.collection_type === 'repositories') {
                            if (!parsedFields.org) {
                                throw new Error(
                                    'To retrieve all repositories of an organisation in GitHub, "org" is required in the "fields" parameter.',
                                );
                            }
                            var repositories = await axios({
                                method: 'get',
                                url: `https://api.github.com/orgs/${parsedFields.org}/repos?${pagingString}`,
                                headers: {
                                    Accept: 'application/vnd.github+json',
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            });
                            result = repositories.data;

                            var linkHeader = repositories.headers.link;
                            let nextCursor, previousCursor;
                            if (linkHeader) {
                                var links = linkHeader.split(',');

                                links?.forEach((link: any) => {
                                    if (link.includes('rel="next"')) {
                                        nextCursor = Number(link.match(/[&?]page=(\d+)/)[1]);
                                    } else if (link.includes('rel="prev"')) {
                                        previousCursor = Number(link.match(/[&?]page=(\d+)/)[1]);
                                    }
                                });
                            }

                            return res.send({
                                status: 'ok',
                                next: nextCursor ? String(nextCursor) : undefined,
                                previous: previousCursor !== undefined ? String(previousCursor) : undefined,
                                results: result,
                            });
                        } else {
                            throw new Error(
                                "To use this endpoint, please specify the type of collection you're working with. Valid options include: 'projects', 'repositories'.",
                            );
                        }

                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch lists', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
    },
    [revertAuthMiddleware(), revertTenantMiddleware()],
);

export { collectionServiceTicket };
