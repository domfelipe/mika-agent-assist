UPDATE public.agent_instances
SET railway_service_id = '12bd6b15-a6de-4df8-bfcb-e00d49cb3217',
    vps_pool_id = '32491252-59b0-4b5a-bbe1-b4777773ec5b',
    status = 'active',
    provisioned_at = now(),
    updated_at = now()
WHERE id = '911396a1-7c2d-42e0-b018-5e7ba21bd181';

UPDATE public.provisioning_jobs
SET status = 'completed',
    railway_service_id = '12bd6b15-a6de-4df8-bfcb-e00d49cb3217',
    completed_at = now(),
    updated_at = now()
WHERE agent_instance_id = '911396a1-7c2d-42e0-b018-5e7ba21bd181'
  AND status IN ('retrying', 'pending', 'running');