"""Integration tests for tasks + dependencies + suggest-assignees endpoints."""


def _create_project(client, headers, **overrides):
    payload = {"name": "Task Test Project", "budget": "100000", "actual_cost": "0", "progress": 0}
    payload.update(overrides)
    resp = client.post("/api/v1/projects", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_task(client, headers, project_id, **overrides):
    payload = {"title": "Do the thing", "status": "TODO", "priority": "MEDIUM", "completion_percentage": 0}
    payload.update(overrides)
    resp = client.post(f"/api/v1/projects/{project_id}/tasks", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestTaskCRUD:
    def test_create_and_list_tasks(self, client, headers_a):
        project = _create_project(client, headers_a)
        _create_task(client, headers_a, project["id"], title="Task A")
        _create_task(client, headers_a, project["id"], title="Task B")
        resp = client.get(f"/api/v1/projects/{project['id']}/tasks", headers=headers_a)
        assert resp.status_code == 200
        titles = {t["title"] for t in resp.json()}
        assert titles == {"Task A", "Task B"}

    def test_create_task_on_nonexistent_project_returns_404(self, client, headers_a):
        resp = client.post(
            "/api/v1/projects/00000000-0000-0000-0000-000000000000/tasks",
            json={"title": "Orphan Task"},
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_update_task_status(self, client, headers_a):
        project = _create_project(client, headers_a)
        task = _create_task(client, headers_a, project["id"])
        resp = client.patch(f"/api/v1/tasks/{task['id']}", json={"status": "DONE"}, headers=headers_a)
        assert resp.status_code == 200
        assert resp.json()["status"] == "DONE"

    def test_delete_task(self, client, headers_a):
        project = _create_project(client, headers_a)
        task = _create_task(client, headers_a, project["id"])
        resp = client.delete(f"/api/v1/tasks/{task['id']}", headers=headers_a)
        assert resp.status_code == 204
        resp = client.get(f"/api/v1/tasks/{task['id']}", headers=headers_a)
        assert resp.status_code == 404


class TestTaskDependencies:
    def test_add_and_remove_dependency(self, client, headers_a):
        project = _create_project(client, headers_a)
        task_a = _create_task(client, headers_a, project["id"], title="A")
        task_b = _create_task(client, headers_a, project["id"], title="B")

        resp = client.post(
            f"/api/v1/tasks/{task_b['id']}/dependencies",
            json={"depends_on_task_id": task_a["id"]},
            headers=headers_a,
        )
        assert resp.status_code == 201
        dependency = resp.json()
        assert dependency["task_id"] == task_b["id"]
        assert dependency["depends_on_task_id"] == task_a["id"]

        resp = client.delete(
            f"/api/v1/tasks/{task_b['id']}/dependencies/{dependency['id']}", headers=headers_a
        )
        assert resp.status_code == 204

    def test_task_cannot_depend_on_itself(self, client, headers_a):
        project = _create_project(client, headers_a)
        task = _create_task(client, headers_a, project["id"])
        resp = client.post(
            f"/api/v1/tasks/{task['id']}/dependencies",
            json={"depends_on_task_id": task["id"]},
            headers=headers_a,
        )
        assert resp.status_code == 400


class TestSuggestAssignees:
    def test_suggest_assignees_ranks_by_skill_and_availability(self, client, headers_a):
        project = _create_project(client, headers_a)
        task = _create_task(
            client, headers_a, project["id"], required_skills=["Python", "Machine Learning"]
        )

        resp = client.post("/api/v1/resources", json={
            "name": "Skilled Resource",
            "role": "ML Engineer",
            "skills": ["Python", "Machine Learning"],
            "hourly_cost": "90",
            "capacity_hours_per_week": "40",
        }, headers=headers_a)
        assert resp.status_code == 201
        resp = client.post("/api/v1/resources", json={
            "name": "Unskilled Resource",
            "role": "Sales",
            "skills": ["Sales"],
            "hourly_cost": "50",
            "capacity_hours_per_week": "40",
        }, headers=headers_a)
        assert resp.status_code == 201

        resp = client.post(f"/api/v1/tasks/{task['id']}/suggest-assignees", json={}, headers=headers_a)
        assert resp.status_code == 200
        candidates = resp.json()
        assert candidates[0]["resource_name"] == "Skilled Resource"
        assert candidates[0]["skill_match_pct"] == 100.0
