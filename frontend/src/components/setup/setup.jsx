/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

import React from 'react';
import {
    Alert,
    Backdrop,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    FormControlLabel,
    LinearProgress,
    Stack,
    Step,
    StepLabel,
    Stepper,
    TextField,
    Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import Grid from '@mui/material/Grid';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import SyncIcon from '@mui/icons-material/Sync';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { toast } from '../../utils/toast-with-timestamp.jsx';
import { setupAdmin } from '../auth/auth-slice.jsx';
import { useSocket } from '../common/socket.jsx';
import { fetchSyncState } from '../satellites/synchronize-slice.jsx';
import { SettingsActionFooter, SettingsSection } from '../settings/shared/index.js';

const WIZARD_STEP_RESTORE = 0;
const WIZARD_STEP_IDENTITY = 1;
const WIZARD_STEP_COORDINATES = 2;
const WIZARD_STEP_REVIEW = 3;
const WIZARD_STEP_ADMIN = 4;

const FULL_RESTORE_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const FULL_RESTORE_MAX_FILE_SIZE_MB = FULL_RESTORE_MAX_FILE_SIZE_BYTES / (1024 * 1024);

const SetupWizard = ({
    wizardBackendReady = true,
    wizardRequireAdminSetup = false,
    hasLocation = false,
    hasPersistedLocation = false,
    canSave = false,
    isDifferentFromSaved = false,
    locationSaving = false,
    onPersistLocation = null,
    onWizardCompleted = null,
    stationIdentitySection = null,
    stationCoordinatesSection = null,
    wizardMapSection = null,
    reviewData = {},
    sectionSx = {},
}) => {
    const { socket } = useSocket();
    const dispatch = useDispatch();
    const { t } = useTranslation('settings');
    const { syncState, synchronizing, status: syncStatus, error: syncError } = useSelector(
        (state) => state.syncSatellite
    );
    const { loadingAction: authLoadingAction, error: authError } = useSelector((state) => state.auth);

    const [wizardStep, setWizardStep] = React.useState(WIZARD_STEP_RESTORE);
    const [wizardRestoreFile, setWizardRestoreFile] = React.useState(null);
    const [wizardRestoreDropTables, setWizardRestoreDropTables] = React.useState(true);
    const [wizardRestoreLoading, setWizardRestoreLoading] = React.useState(false);
    const [wizardRestoreFileInputKey, setWizardRestoreFileInputKey] = React.useState(0);
    const [showRestoreReloadBackdrop, setShowRestoreReloadBackdrop] = React.useState(false);
    const [adminUsername, setAdminUsername] = React.useState('');
    const [adminPassword, setAdminPassword] = React.useState('');
    const [adminConfirmPassword, setAdminConfirmPassword] = React.useState('');
    const [adminLocalError, setAdminLocalError] = React.useState('');

    const showWizardAdminStep = Boolean(wizardRequireAdminSetup);
    const stationName = String(reviewData.stationName || '');
    const stationCallsignLabel = String(reviewData.stationCallsignLabel || '');
    const stationType = String(reviewData.stationType || 'stationary');
    const stationHorizonMask = Number(reviewData.stationHorizonMask ?? 0);

    const wizardStepLabels = React.useMemo(
        () => ({
            [WIZARD_STEP_RESTORE]: t('location.wizard_step_restore', {
                defaultValue: 'Restore Backup (Optional)',
            }),
            [WIZARD_STEP_ADMIN]: t('location.wizard_step_admin', { defaultValue: 'Create Admin User' }),
            [WIZARD_STEP_IDENTITY]: t('location.wizard_step_identity', {
                defaultValue: 'Station Identity',
            }),
            [WIZARD_STEP_COORDINATES]: t('location.wizard_step_coordinates', {
                defaultValue: 'Coordinates & Map',
            }),
            [WIZARD_STEP_REVIEW]: t('location.wizard_step_review', { defaultValue: 'Review & Save' }),
        }),
        [t]
    );
    const wizardStepOrder = React.useMemo(
        () =>
            showWizardAdminStep
                ? [
                      WIZARD_STEP_RESTORE,
                      WIZARD_STEP_ADMIN,
                      WIZARD_STEP_IDENTITY,
                      WIZARD_STEP_COORDINATES,
                      WIZARD_STEP_REVIEW,
                  ]
                : [
                      WIZARD_STEP_RESTORE,
                      WIZARD_STEP_IDENTITY,
                      WIZARD_STEP_COORDINATES,
                      WIZARD_STEP_REVIEW,
                  ],
        [showWizardAdminStep]
    );
    const wizardCurrentOrderIndex = Math.max(0, wizardStepOrder.indexOf(wizardStep));
    const isWizardLastStep = wizardCurrentOrderIndex === wizardStepOrder.length - 1;
    const canAdvanceWizard = wizardStep !== WIZARD_STEP_COORDINATES || hasLocation;

    const syncLastUpdateText = React.useMemo(() => {
        if (!syncState?.last_update) {
            return t('location.state_unavailable', { defaultValue: 'Unavailable' });
        }

        const timestamp = new Date(syncState.last_update);
        if (Number.isNaN(timestamp.getTime())) {
            return String(syncState.last_update);
        }

        return timestamp.toLocaleString();
    }, [syncState?.last_update, t]);
    const orbitalSyncUiState = React.useMemo(() => {
        const rawStatus = String(syncState?.status || '').toLowerCase();
        const normalizedStatus =
            rawStatus === 'in_progress' || rawStatus === 'inprogress' || rawStatus === 'started'
                ? 'inprogress'
                : rawStatus;
        const hasErrors = Array.isArray(syncState?.errors) && syncState.errors.length > 0;
        const primaryError = hasErrors ? syncState.errors[0] : syncError || null;

        if (normalizedStatus === 'inprogress' || synchronizing) {
            const progressValue = Number.isFinite(Number(syncState?.progress))
                ? Number(syncState?.progress)
                : 0;
            return {
                label: t('location.orbital_sync_in_progress', {
                    defaultValue: 'Synchronization in progress',
                }),
                color: 'info',
                icon: <SyncIcon />,
                progress: Math.max(0, Math.min(100, progressValue)),
                error: null,
            };
        }

        if ((normalizedStatus === 'complete' && syncState?.success === false) || hasErrors || primaryError) {
            return {
                label: t('location.orbital_sync_failed', { defaultValue: 'Synchronization failed' }),
                color: 'error',
                icon: <CloudOffIcon />,
                progress: null,
                error: primaryError || t('location.state_unavailable', { defaultValue: 'Unavailable' }),
            };
        }

        if (normalizedStatus === 'complete' && syncState?.success === true) {
            return {
                label: t('location.orbital_sync_ok', { defaultValue: 'Synchronization complete' }),
                color: 'success',
                icon: <CloudDoneIcon />,
                progress: null,
                error: null,
            };
        }

        return {
            label: t('location.orbital_sync_idle', {
                defaultValue: 'Synchronization status unavailable',
            }),
            color: 'default',
            icon: <CloudOffIcon />,
            progress: null,
            error: null,
        };
    }, [
        syncError,
        syncState?.errors,
        syncState?.progress,
        syncState?.status,
        syncState?.success,
        synchronizing,
        t,
    ]);

    React.useEffect(() => {
        if (wizardStep !== WIZARD_STEP_REVIEW || !socket || !socket.connected) {
            return;
        }

        dispatch(fetchSyncState({ socket }));
    }, [dispatch, socket, wizardStep]);

    const validateAdminDraft = () => {
        const normalizedUsername = adminUsername.trim();
        if (!normalizedUsername) {
            setAdminLocalError('Username is required.');
            return false;
        }
        if (adminPassword.length < 8) {
            setAdminLocalError('Password must be at least 8 characters long.');
            return false;
        }
        if (adminPassword !== adminConfirmPassword) {
            setAdminLocalError('Passwords do not match.');
            return false;
        }
        setAdminLocalError('');
        return true;
    };

    const handleWizardNext = () => {
        if (isWizardLastStep || !canAdvanceWizard) return;

        if (wizardStep === WIZARD_STEP_ADMIN && !validateAdminDraft()) {
            return;
        }

        const nextStep = wizardStepOrder[wizardCurrentOrderIndex + 1];
        if (nextStep == null) return;
        setWizardStep(nextStep);
    };

    const handleWizardBack = () => {
        if (wizardStep === WIZARD_STEP_RESTORE) return;

        const previousStep = wizardStepOrder[wizardCurrentOrderIndex - 1];
        if (previousStep == null) return;
        setWizardStep(previousStep);
    };

    const handleWizardSave = async () => {
        if (!wizardBackendReady || !hasLocation || typeof onPersistLocation !== 'function') return;

        // Persist location before admin setup so setup state remains resumable and consistent.
        if (isDifferentFromSaved || !hasPersistedLocation) {
            const saveSucceeded = await onPersistLocation();
            if (!saveSucceeded) {
                return;
            }
        }

        if (!showWizardAdminStep) {
            if (typeof onWizardCompleted === 'function') {
                onWizardCompleted();
            }
            return;
        }

        if (!validateAdminDraft()) {
            return;
        }

        const normalizedUsername = adminUsername.trim();

        try {
            await dispatch(
                setupAdmin({
                    username: normalizedUsername,
                    password: adminPassword,
                })
            ).unwrap();
            if (typeof onWizardCompleted === 'function') {
                onWizardCompleted();
            }
        } catch {
            // Error state is surfaced by auth slice and rendered in this step.
        }
    };

    const handleWizardRestoreFileSelect = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (file.size > FULL_RESTORE_MAX_FILE_SIZE_BYTES) {
            toast.error(
                t('location.wizard_restore_file_too_large', {
                    defaultValue: `Selected file exceeds ${FULL_RESTORE_MAX_FILE_SIZE_MB} MB limit. Please choose a smaller backup file.`,
                })
            );
            setWizardRestoreFile(null);
            setWizardRestoreFileInputKey((current) => current + 1);
            return;
        }

        setWizardRestoreFile(file);
    };

    const handleWizardRestoreDatabase = async () => {
        if (!wizardBackendReady || !socket || !wizardRestoreFile) return;

        if (wizardRestoreFile.size > FULL_RESTORE_MAX_FILE_SIZE_BYTES) {
            toast.error(
                t('location.wizard_restore_file_too_large', {
                    defaultValue: `Selected file exceeds ${FULL_RESTORE_MAX_FILE_SIZE_MB} MB limit. Please choose a smaller backup file.`,
                })
            );
            return;
        }

        setWizardRestoreLoading(true);
        try {
            const sqlContent = await wizardRestoreFile.text();
            const response = await socket.emitWithAck('api.call', {
                cmd: 'database-backup.full_restore',
                data: {
                    action: 'full_restore',
                    sql: sqlContent,
                    drop_tables: wizardRestoreDropTables,
                },
            });

            if (response?.success) {
                toast.success(
                    t('location.wizard_restore_success', {
                        defaultValue: `Backup restored successfully. ${response.tables_created} tables created, ${response.rows_inserted} rows inserted.`,
                    })
                );
                setShowRestoreReloadBackdrop(true);
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
                return;
            }

            toast.error(
                t('location.wizard_restore_failed', {
                    defaultValue: `Failed to restore database: ${response?.error || 'Unknown error'}`,
                })
            );
        } catch (error) {
            toast.error(
                t('location.wizard_restore_error', {
                    defaultValue: `Error restoring database: ${error?.message || String(error)}`,
                })
            );
        } finally {
            setWizardRestoreLoading(false);
        }
    };

    const wizardRestoreSection = (
        <SettingsSection
            title={t('location.wizard_restore_title', { defaultValue: 'Restore Existing Backup (Optional)' })}
            description={t('location.wizard_restore_help', {
                defaultValue: 'If you already have a Ground Station backup, restore it now before continuing setup.',
            })}
            sx={sectionSx}
        >
            <Stack spacing={2}>
                <Alert severity="warning">
                    {t('location.wizard_restore_warning', {
                        defaultValue: 'This replaces database content with the selected backup file.',
                    })}
                </Alert>
                <Alert severity="info">
                    {t('location.wizard_restore_file_requirements', {
                        defaultValue: `Use a full SQL backup that includes schema and data. Maximum size: ${FULL_RESTORE_MAX_FILE_SIZE_MB} MB.`,
                    })}
                </Alert>
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={wizardRestoreDropTables}
                            onChange={(event) => setWizardRestoreDropTables(event.target.checked)}
                            disabled={wizardRestoreLoading}
                        />
                    }
                    label={t('location.wizard_restore_drop_tables', {
                        defaultValue: 'Drop existing tables before restore (recommended)',
                    })}
                />
                <Button variant="outlined" component="label" disabled={wizardRestoreLoading} fullWidth>
                    {t('location.wizard_restore_select_file', { defaultValue: 'Select Full Backup SQL File' })}
                    <input
                        key={wizardRestoreFileInputKey}
                        type="file"
                        hidden
                        accept=".sql"
                        onChange={handleWizardRestoreFileSelect}
                    />
                </Button>
                {wizardRestoreFile && (
                    <Typography variant="body2" color="text.secondary">
                        {t('location.wizard_restore_selected_file', {
                            defaultValue: `Selected: ${wizardRestoreFile.name}`,
                        })}
                    </Typography>
                )}
                <Button
                    variant="contained"
                    color="warning"
                    onClick={handleWizardRestoreDatabase}
                    disabled={!wizardRestoreFile || wizardRestoreLoading || !wizardBackendReady}
                >
                    {wizardRestoreLoading ? (
                        <CircularProgress size={20} color="inherit" />
                    ) : (
                        t('location.wizard_restore_button', { defaultValue: 'Restore Backup and Reload' })
                    )}
                </Button>
            </Stack>
        </SettingsSection>
    );

    const wizardReviewSection = (
        <SettingsSection
            title={t('location.wizard_review_title', { defaultValue: 'Review Configuration' })}
            description={t('location.wizard_review_help', {
                defaultValue: 'Verify station identity and coordinates, then save to continue.',
            })}
            sx={sectionSx}
        >
            <Grid container spacing={2} columns={12}>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography variant="caption" color="text.secondary">
                        {t('location.station_name', { defaultValue: 'Station Name' })}
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'text.primary', fontWeight: 600 }}>
                        {stationName || 'home'}
                    </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography variant="caption" color="text.secondary">
                        {t('location.ham_callsign', { defaultValue: 'HAM Callsign' })}
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'text.primary', fontWeight: 600 }}>
                        {stationCallsignLabel || t('location.state_unavailable', { defaultValue: 'Unavailable' })}
                    </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography variant="caption" color="text.secondary">
                        {t('location.station_type', { defaultValue: 'Station Type' })}
                    </Typography>
                    <Typography
                        variant="body1"
                        sx={{ color: 'text.primary', fontWeight: 600, textTransform: 'capitalize' }}
                    >
                        {stationType}
                    </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography variant="caption" color="text.secondary">
                        {t('location.horizon_mask', { defaultValue: 'Horizon Mask (°)' })}
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'text.primary', fontWeight: 600 }}>
                        {`${stationHorizonMask}\u00b0`}
                    </Typography>
                </Grid>
            </Grid>
        </SettingsSection>
    );

    const wizardOrbitalSyncSection = (
        <SettingsSection
            title={t('location.orbital_sync_title', { defaultValue: 'Orbital Data Sync' })}
            sx={sectionSx}
        >
            <Stack spacing={1.1}>
                <Typography variant="caption" color="text.secondary">
                    {t('location.orbital_sync_review_help', {
                        defaultValue: 'Current backend synchronization state for orbital data.',
                    })}
                </Typography>
                <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    alignItems={{ xs: 'stretch', sm: 'center' }}
                >
                    <Chip
                        size="small"
                        color={orbitalSyncUiState.color}
                        icon={orbitalSyncUiState.icon}
                        label={orbitalSyncUiState.label}
                    />
                    <Typography variant="caption" color="text.secondary">
                        {t('location.orbital_sync_last_update', { defaultValue: 'Last update' })}:{' '}
                        {syncLastUpdateText}
                    </Typography>
                </Stack>
                {orbitalSyncUiState.progress != null && (
                    <LinearProgress
                        variant="determinate"
                        value={orbitalSyncUiState.progress}
                        sx={{ height: 8, borderRadius: 1 }}
                    />
                )}
                {orbitalSyncUiState.error && (
                    <Typography variant="caption" color="error.main">
                        {orbitalSyncUiState.error}
                    </Typography>
                )}
                {syncStatus === 'loading' && (
                    <Typography variant="caption" color="text.secondary">
                        {t('location.state_loading', { defaultValue: 'Loading...' })}
                    </Typography>
                )}
            </Stack>
        </SettingsSection>
    );

    const wizardReviewContent = (
        <Grid container spacing={2} columns={12} alignItems="stretch">
            <Grid
                size={{ xs: 12, md: 5 }}
                sx={{
                    display: 'flex',
                    '& > *': {
                        width: '100%',
                        height: '100%',
                    },
                }}
            >
                {wizardReviewSection}
            </Grid>
            <Grid
                size={{ xs: 12, md: 7 }}
                sx={{
                    display: 'flex',
                    '& > *': {
                        width: '100%',
                        height: '100%',
                    },
                }}
            >
                {stationCoordinatesSection}
            </Grid>
            <Grid
                size={{ xs: 12, md: 12 }}
                sx={{
                    display: 'flex',
                    '& > *': {
                        width: '100%',
                    },
                }}
            >
                {wizardOrbitalSyncSection}
            </Grid>
        </Grid>
    );

    const wizardAdminSection = (
        <SettingsSection
            title={t('location.wizard_admin_title', { defaultValue: 'Create Administrator Account' })}
            description={t('location.wizard_admin_help', {
                defaultValue:
                    'Create the first admin account credentials. Account will be created when setup finishes.',
            })}
            sx={sectionSx}
        >
            <Stack spacing={2}>
                <Alert severity="info">
                    {t('location.wizard_admin_notice', {
                        defaultValue:
                            'This account will be the initial administrator for this Ground Station instance.',
                    })}
                </Alert>
                {(adminLocalError || authError) && (
                    <Alert severity="error">{adminLocalError || authError}</Alert>
                )}
                <TextField
                    label="Username"
                    value={adminUsername}
                    onChange={(event) => {
                        setAdminUsername(event.target.value);
                        if (adminLocalError) setAdminLocalError('');
                    }}
                    autoComplete="username"
                    required
                    fullWidth
                    disabled={authLoadingAction}
                />
                <TextField
                    label="Password"
                    type="password"
                    value={adminPassword}
                    onChange={(event) => {
                        setAdminPassword(event.target.value);
                        if (adminLocalError) setAdminLocalError('');
                    }}
                    autoComplete="new-password"
                    required
                    fullWidth
                    disabled={authLoadingAction}
                />
                <TextField
                    label="Confirm password"
                    type="password"
                    value={adminConfirmPassword}
                    onChange={(event) => {
                        setAdminConfirmPassword(event.target.value);
                        if (adminLocalError) setAdminLocalError('');
                    }}
                    autoComplete="new-password"
                    required
                    fullWidth
                    disabled={authLoadingAction}
                />
            </Stack>
        </SettingsSection>
    );

    return (
        <>
            <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <Box sx={{ px: { xs: 0, sm: 1 } }}>
                    <Box
                        sx={{
                            position: 'sticky',
                            top: 0,
                            zIndex: 3,
                            py: 0.75,
                            mb: '2em',
                            backgroundColor: (theme) =>
                                theme.palette.mode === 'dark'
                                    ? theme.palette.background.elevated
                                    : theme.palette.background.paper,
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                        }}
                    >
                        <Stepper activeStep={wizardStep} alternativeLabel>
                            {wizardStepOrder.map((stepId, index) => (
                                <Step key={stepId} completed={index < wizardCurrentOrderIndex}>
                                    <StepLabel>{wizardStepLabels[stepId]}</StepLabel>
                                </Step>
                            ))}
                        </Stepper>
                    </Box>
                </Box>

                <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    {wizardStep === WIZARD_STEP_RESTORE && <Stack spacing={2}>{wizardRestoreSection}</Stack>}

                    {wizardStep === WIZARD_STEP_IDENTITY && (
                        <Stack spacing={2}>{stationIdentitySection}</Stack>
                    )}

                    {wizardStep === WIZARD_STEP_COORDINATES && (
                        <Stack spacing={2}>{wizardMapSection}</Stack>
                    )}

                    {wizardStep === WIZARD_STEP_REVIEW && <Stack spacing={2}>{wizardReviewContent}</Stack>}

                    {wizardStep === WIZARD_STEP_ADMIN && <Stack spacing={2}>{wizardAdminSection}</Stack>}
                </Box>

                <SettingsActionFooter
                    statusText={
                        wizardStep === WIZARD_STEP_RESTORE
                            ? t('location.wizard_restore_skip_help', {
                                  defaultValue: 'You can skip this step and continue with a fresh setup.',
                              })
                            : ''
                    }
                    mobileInline
                    sx={{
                        mt: 'auto',
                        zIndex: 4,
                        backgroundColor: (theme) =>
                            theme.palette.mode === 'dark'
                                ? alpha(theme.palette.grey[700], 0.18)
                                : alpha(theme.palette.grey[100], 0.9),
                    }}
                >
                    <Button
                        variant="outlined"
                        onClick={handleWizardBack}
                        disabled={
                            wizardStep === WIZARD_STEP_RESTORE ||
                            locationSaving ||
                            wizardRestoreLoading ||
                            authLoadingAction
                        }
                    >
                        {t('location.back', { defaultValue: 'Back' })}
                    </Button>
                    {isWizardLastStep ? (
                        <Button
                            variant="contained"
                            disabled={
                                showWizardAdminStep
                                    ? !hasLocation || authLoadingAction || locationSaving || !wizardBackendReady
                                    : !canSave || !isDifferentFromSaved || !wizardBackendReady
                            }
                            aria-label={t('location.save_location')}
                            onClick={handleWizardSave}
                        >
                            {showWizardAdminStep && authLoadingAction
                                ? 'Creating account...'
                                : locationSaving
                                  ? t('location.state_saving', { defaultValue: 'Saving...' })
                                  : t('location.finish_setup', { defaultValue: 'Save and Continue' })}
                        </Button>
                    ) : (
                        <Button
                            variant="contained"
                            onClick={handleWizardNext}
                            disabled={!canAdvanceWizard || locationSaving || wizardRestoreLoading}
                        >
                            {t('location.next', { defaultValue: 'Next' })}
                        </Button>
                    )}
                </SettingsActionFooter>
            </Box>

            <Backdrop
                sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
                open={showRestoreReloadBackdrop}
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <CircularProgress color="inherit" size={60} />
                    <Typography variant="h6" sx={{ mt: 2 }}>
                        {t('location.wizard_restore_reloading', { defaultValue: 'Reloading application...' })}
                    </Typography>
                </Box>
            </Backdrop>
        </>
    );
};

export default SetupWizard;
